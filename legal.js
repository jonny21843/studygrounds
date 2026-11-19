// StudyGrounds legal gate: server records are authoritative, never browser storage.
let legalStatus = null;
let legalCheckPromise = null;
async function checkLegalStatus() {
    if (!isAuthenticated()) return true;
    const token = getAccessToken();
    const response = await fetch(getApiBaseUrl() + "/api/legal/status", {headers: {"Authorization": "Bearer " + token}, cache: "no-store"});
    if (!response.ok) throw new Error("Unable to verify legal acceptance (" + response.status + ")");
    const data = await response.json();
    if (getAccessToken() !== token) return false;
    legalStatus = data;
    if (data.required) showLegalGate();
    else hideLegalGate();
    return !data.required;
}
function hideLegalGate() {
    document.getElementById("legal-gate")?.remove();
}
function showLegalGate(message = "") {
    if (!isAuthenticated()) return;
    let gate = document.getElementById("legal-gate");
    if (!gate) {
        gate = document.createElement("div");
        gate.id = "legal-gate";
        gate.className = "legal-gate";
        gate.innerHTML = `<section class="legal-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
            <p class="eyebrow">StudyGrounds · Community safety</p>
            <h2 id="legal-gate-title">Review our policies</h2>
            <p>Before continuing, please review our legal documents. Your notes and account will remain available after you accept.</p>
            <p><a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a> (v<span id="legal-terms-version"></span>) · <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> (v<span id="legal-privacy-version"></span>) · <a href="/community-guidelines.html" target="_blank" rel="noopener">Community Guidelines</a> · <a href="/copyright.html" target="_blank" rel="noopener">Copyright and DMCA Policy</a></p>
            <form id="legal-accept-form">
                <label><input id="legal-age" type="checkbox" required> I confirm that I am at least 13 years old.</label>
                <label><input id="legal-agree" type="checkbox" required> I have read and agree to the Terms of Use.</label>
                <label><input id="legal-privacy" type="checkbox" required> I acknowledge the Privacy Policy.</label>
                <p id="legal-gate-message" role="alert" class="status-text"></p>
                <div class="home-actions"><button class="button button-primary" type="submit">Accept and Continue</button><button id="legal-retry" type="button" class="button button-secondary" hidden>Retry Check</button><button id="legal-signout" type="button" class="button button-secondary">Sign Out</button></div>
            </form>
        </section>`;
        document.body.append(gate);
        gate.querySelector("#legal-signout").addEventListener("click", signOut);
        gate.querySelector("#legal-retry").addEventListener("click", () => { window.location.reload(); });
        gate.querySelector("#legal-accept-form").addEventListener("submit", async event => {
            event.preventDefault();
            const button = gate.querySelector('[type="submit"]');
            button.disabled = true;
            try {
                const response = await fetch(getApiBaseUrl() + "/api/legal/accept", {
                    method: "POST",
                    headers: {"Authorization": "Bearer " + getAccessToken(), "Content-Type": "application/json"},
                    body: JSON.stringify({
                        termsVersion: legalStatus.documents.terms.version,
                        privacyVersion: legalStatus.documents.privacy.version,
                        agreeToTerms: gate.querySelector("#legal-agree").checked,
                        acknowledgePrivacy: gate.querySelector("#legal-privacy").checked,
                        age13OrOlder: gate.querySelector("#legal-age").checked
                    })
                });
                if (!response.ok) throw new Error((await response.json()).error || "Could not save acceptance.");
                await checkLegalStatus();
                if (!document.getElementById("legal-gate")) window.location.reload();
            } catch (error) {
                gate.querySelector("#legal-gate-message").textContent = error.message;
                button.disabled = false;
            }
        });
    }
    if (legalStatus) {
        gate.querySelector("#legal-terms-version").textContent = legalStatus.documents.terms.version;
        gate.querySelector("#legal-privacy-version").textContent = legalStatus.documents.privacy.version;
    }
    gate.querySelector("#legal-gate-message").textContent = message;
    gate.querySelector('[type="submit"]').disabled = !legalStatus;
    gate.querySelector("#legal-retry").hidden = Boolean(legalStatus);
    gate.querySelector("#legal-agree").focus();
}
async function ensureLegalAcceptance() {
    if (!isAuthenticated()) return true;
    if (!legalCheckPromise) legalCheckPromise = checkLegalStatus().finally(() => { legalCheckPromise = null; });
    try { return await legalCheckPromise; }
    catch (error) { showLegalGate("Unable to verify policies. Please refresh the page or sign out."); return false; }
}
