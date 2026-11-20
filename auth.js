function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function generateRandomString(length = 64) {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const randomValues = new Uint8Array(length);

    crypto.getRandomValues(randomValues);

    return Array.from(randomValues)
        .map((value) => characters[value % characters.length])
        .join("");
}

async function createPkceChallenge(verifier) {
    const encoded = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest("SHA-256", encoded);

    return base64UrlEncode(digest);
}

// This is a pre-registration warning, not independently verified age assurance.
function signIn() {
    sessionStorage.removeItem("studygrounds_signup_age_confirmed");
    startHostedAuth("authorize");
}

function signUp() {
    if (document.getElementById("age-signup-gate")) return;
    const overlay = document.createElement("div");
    overlay.id = "age-signup-gate";
    overlay.className = "legal-gate";
    overlay.innerHTML = `<section class="legal-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
        <h2 id="age-gate-title">Welcome to StudyGrounds</h2>
        <p>StudyGrounds is for people aged 13 and older. Existing members can sign in. New members must confirm age eligibility before registering.</p>
        <div class="age-gate-buttons"><button id="age-existing" class="button button-primary" type="button">Sign in to my account</button></div>
        <hr>
        <label><input type="checkbox" id="age-signup-confirm"> I confirm that I am at least 13 years old.</label>
        <p><a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a> · <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p>
        <div class="age-gate-buttons"><button id="age-new" class="button button-secondary" type="button" disabled>Create an account</button><button id="age-cancel" class="button button-text" type="button">Cancel</button></div>
        <p class="note-description">You cannot create an account if you are under 13.</p>
    </section>`;
    document.body.append(overlay);
    const age = overlay.querySelector("#age-signup-confirm");
    const create = overlay.querySelector("#age-new");
    age.addEventListener("change", () => {create.disabled = !age.checked;});
    overlay.querySelector("#age-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#age-existing").addEventListener("click", () => {overlay.remove(); signIn();});
    create.addEventListener("click", () => {
        if (!age.checked) return;
        // Session-scoped UI confirmation survives Cognito; backend still
        // requires affirmative proof on first legal acceptance.
        sessionStorage.setItem("studygrounds_signup_age_confirmed", "1");
        startHostedAuth("signup");
    });
    overlay.querySelector("#age-existing").focus();
}

async function startHostedAuth(screen = "authorize") {
    const verifier = generateRandomString(64);
    const challenge = await createPkceChallenge(verifier);
    const state = generateRandomString(32);

    sessionStorage.setItem("pkce_code_verifier", verifier);
    sessionStorage.setItem("oauth_state", state);

    const params = new URLSearchParams({
        response_type: "code",
        client_id: APP_CONFIG.cognitoClientId,
        redirect_uri: APP_CONFIG.cognitoRedirectUri,
        scope: "openid email profile",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
    });

    window.location.assign(
        `${APP_CONFIG.cognitoDomain}/${screen === "signup" ? "signup" : "oauth2/authorize"}?${params.toString()}`
    );
}

function clearTokens() {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("id_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("token_expires_at");
}

function signOut() {
    sessionStorage.removeItem("studygrounds_signup_age_confirmed");
    clearTokens();

    const params = new URLSearchParams({
        client_id: APP_CONFIG.cognitoClientId,
        logout_uri: APP_CONFIG.cognitoLogoutUri
    });

    window.location.assign(
        `${APP_CONFIG.cognitoDomain}/logout?${params.toString()}`
    );
}

function getAccessToken() {
    return sessionStorage.getItem("access_token");
}

function isAuthenticated() {
    const token = getAccessToken();
    const expiresAt = Number(sessionStorage.getItem("token_expires_at"));

    return Boolean(token && expiresAt && Date.now() < expiresAt);
}

function getApiBaseUrl() {
    return (APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
}

function decodeJwtPayload(token) {
    if (!token) {
        return null;
    }

    try {
        const payload = token.split(".")[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const padded = payload.padEnd(
            payload.length + ((4 - payload.length % 4) % 4),
            "="
        );

        return JSON.parse(
            decodeURIComponent(
                Array.from(atob(padded))
                    .map((char) =>
                        "%" + char.charCodeAt(0).toString(16).padStart(2, "0")
                    )
                    .join("")
            )
        );
    } catch (error) {
        console.error("Unable to decode ID token:", error);
        return null;
    }
}

function getDisplayIdentity() {
    const claims = decodeJwtPayload(sessionStorage.getItem("id_token"));

    return claims?.email || claims?.name || null;
}

function getPublicAuthorLabel() {
    const claims = decodeJwtPayload(sessionStorage.getItem("id_token")) || {};
    const givenName = (claims.given_name || "").trim();
    const familyName = (claims.family_name || "").trim();

    if (givenName && familyName) {
        return `${givenName} ${familyName.charAt(0).toUpperCase()}.`;
    }

    if (claims.name) {
        const parts = String(claims.name).trim().split(/\s+/).filter(Boolean);

        if (parts.length >= 2) {
            return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
        }

        if (parts.length === 1) {
            return parts[0];
        }
    }

    return "Community member";
}

async function loadCurrentUser() {
    const token = getAccessToken();
    const apiBaseUrl = getApiBaseUrl();

    if (!token || !apiBaseUrl) {
        return null;
    }

    const response = await fetch(`${apiBaseUrl}/api/me`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 401 || response.status === 403) {
        if (getAccessToken() === token) clearTokens();
        return null;
    }

    if (!response.ok) {
        throw new Error(`Current-user request failed with status ${response.status}`);
    }

    return response.json();
}

async function updateAuthUi() {
    const status = document.getElementById("auth-status");
    const signInButton = document.getElementById("sign-in-btn");
    const signUpButton = document.getElementById("sign-up-btn");
    const signOutButton = document.getElementById("sign-out-btn");

    if (!status || !signInButton || !signOutButton) {
        return;
    }

    if (!isAuthenticated()) {
        status.textContent = "Not signed in";
        signInButton.hidden = false;
        if (signUpButton) signUpButton.hidden = false;
        signOutButton.hidden = true;
        return;
    }

    signInButton.hidden = true;
    if (signUpButton) signUpButton.hidden = true;
    signOutButton.hidden = false;

    const displayIdentity = getDisplayIdentity();
    status.textContent = displayIdentity
        ? `Signed in as ${displayIdentity}`
        : "Signed in";

    if (!getApiBaseUrl()) {
        return;
    }

    const verifiedToken = getAccessToken();
    try {
        const user = await loadCurrentUser();
        if (verifiedToken !== getAccessToken()) return;

        if (!user || !isAuthenticated()) {
            status.textContent = "Not signed in";
            signInButton.hidden = false;
            if (signUpButton) signUpButton.hidden = false;
            signOutButton.hidden = true;
            if (typeof renderSignedInState === "function") renderSignedInState();
        }
    } catch (error) {
        console.error("Unable to verify current user:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document
        .getElementById("sign-in-btn")
        ?.addEventListener("click", signIn);

    document
        .getElementById("sign-out-btn")
        ?.addEventListener("click", signOut);
    document.getElementById("sign-up-btn")?.addEventListener("click", signUp);

    updateAuthUi();
});

// Update stale sign-in controls when returning to a tab after token expiry.
window.addEventListener("focus", updateAuthUi);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateAuthUi();
});
