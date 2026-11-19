const CURATED_SUBJECTS = [
    "Technology",
    "Medicine & Health",
    "Engineering",
    "Science",
    "Space & Astronomy",
    "Psychology",
    "Mathematics",
    "Business & Finance",
    "Law & Government",
    "Education",
    "History",
    "Arts & Humanities",
    "Social Sciences",
    "Languages"
];

let publicTaxonomy = {
    subjects: [...CURATED_SUBJECTS],
    topics: [],
    subjectTopics: {}
};

let personalTaxonomy = {
    subjects: [],
    topics: [],
    subjectTopics: {}
};

function normalizeOptions(values) {
    return [...new Set((values || []).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}

function mergedCreationTaxonomy() {
    const subjectTopics = {};

    for (const taxonomy of [publicTaxonomy, personalTaxonomy]) {
        for (const [subject, topics] of Object.entries(taxonomy.subjectTopics || {})) {
            const existingKey = Object.keys(subjectTopics).find(
                (key) => key.toLowerCase() === subject.toLowerCase()
            );
            const key = existingKey || subject;
            subjectTopics[key] = normalizeOptions([
                ...(subjectTopics[key] || []),
                ...(topics || [])
            ]);
        }
    }

    return {
        subjects: normalizeOptions([
            ...CURATED_SUBJECTS,
            ...(publicTaxonomy.subjects || []),
            ...(personalTaxonomy.subjects || [])
        ]),
        topics: normalizeOptions([
            ...(publicTaxonomy.topics || []),
            ...(personalTaxonomy.topics || [])
        ]),
        subjectTopics
    };
}

function getSearchSelectValues(type) {
    const taxonomy = mergedCreationTaxonomy();

    if (type === "subject") {
        return taxonomy.subjects;
    }

    const subject = document.getElementById("note-subject")?.value.trim() || "";

    if (!subject) {
        return taxonomy.topics;
    }

    const subjectKey = Object.keys(taxonomy.subjectTopics || {}).find(
        (key) => key.toLowerCase() === subject.toLowerCase()
    );

    return subjectKey
        ? taxonomy.subjectTopics[subjectKey]
        : [];
}

function closeSearchSelect(container) {
    const menu = container?.querySelector(".search-select-menu");
    const toggle = container?.querySelector(".search-select-toggle");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
}

function renderSearchSelectOptions(container, forceOpen = false) {
    if (!container) return;

    const type = container.dataset.searchSelect;
    const input = container.querySelector("input");
    const menu = container.querySelector(".search-select-menu");
    const toggle = container.querySelector(".search-select-toggle");
    const query = (input?.value || "").trim().toLowerCase();

    const values = normalizeOptions(getSearchSelectValues(type));
    const filtered = query
        ? values.filter((value) => value.toLowerCase().includes(query))
        : values;

    if (!menu || !input) return;

    if (!filtered.length) {
        menu.innerHTML = `
            <div class="search-select-empty">
                No matching existing ${type}. You can keep your custom value.
            </div>
        `;
    } else {
        menu.innerHTML = filtered
            .map(
                (value) => `
                    <button
                        class="search-select-option"
                        type="button"
                        data-value="${escapeHtml(value)}"
                    >
                        ${escapeHtml(value)}
                    </button>
                `
            )
            .join("");

        menu.querySelectorAll(".search-select-option").forEach((option) => {
            option.addEventListener("click", () => {
                input.value = option.dataset.value || "";
                closeSearchSelect(container);

                if (type === "subject") {
                    refreshTopicSuggestions();
                    document.getElementById("note-collection")?.focus();
                }
            });
        });
    }

    if (forceOpen || document.activeElement === input) {
        menu.hidden = false;
        toggle?.setAttribute("aria-expanded", "true");
    }
}

function refreshTopicSuggestions() {
    const topicContainer = document.querySelector('[data-search-select="topic"]');
    renderSearchSelectOptions(topicContainer, false);
}

function setupSearchSelects() {
    document.querySelectorAll(".search-select").forEach((container) => {
        const input = container.querySelector("input");
        const toggle = container.querySelector(".search-select-toggle");

        const options = () => [...container.querySelectorAll(".search-select-option")];

        const setActiveOption = (index) => {
            const items = options();
            if (!items.length) return;

            items.forEach((item, itemIndex) => {
                const active = itemIndex === index;
                item.classList.toggle("keyboard-active", active);
                item.setAttribute("aria-selected", String(active));
            });

            items[index]?.scrollIntoView({block: "nearest"});
        };

        const activeOptionIndex = () => {
            const items = options();
            const index = items.findIndex((item) => item.classList.contains("keyboard-active"));
            return index >= 0 ? index : 0;
        };

        const commitOption = (option) => {
            if (!option || !input) return false;

            input.value = option.dataset.value || "";
            closeSearchSelect(container);

            if (container.dataset.searchSelect === "subject") {
                refreshTopicSuggestions();
            }

            return true;
        };

        input?.addEventListener("focus", () => {
            renderSearchSelectOptions(container, true);
            setActiveOption(0);
        });

        input?.addEventListener("input", () => {
            renderSearchSelectOptions(container, true);
            setActiveOption(0);

            if (container.dataset.searchSelect === "subject") {
                refreshTopicSuggestions();
            }
        });

        input?.addEventListener("keydown", (event) => {
            const menu = container.querySelector(".search-select-menu");
            const items = options();

            if (event.key === "ArrowDown") {
                event.preventDefault();
                if (menu?.hidden) renderSearchSelectOptions(container, true);
                const next = Math.min(activeOptionIndex() + 1, Math.max(items.length - 1, 0));
                setActiveOption(next);
                return;
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                if (menu?.hidden) renderSearchSelectOptions(container, true);
                const next = Math.max(activeOptionIndex() - 1, 0);
                setActiveOption(next);
                return;
            }

            if (event.key === "Enter") {
                if (!menu?.hidden && items.length) {
                    event.preventDefault();
                    event.stopPropagation();
                    commitOption(items[activeOptionIndex()] || items[0]);

                    if (container.dataset.searchSelect === "subject") {
                        document.getElementById("note-collection")?.focus();
                    }
                }
                return;
            }

            if (event.key === "Tab") {
                if (!menu?.hidden && items.length) {
                    commitOption(items[activeOptionIndex()] || items[0]);
                }
                return;
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeSearchSelect(container);
            }
        });

        toggle?.addEventListener("click", () => {
            const menu = container.querySelector(".search-select-menu");
            const isOpen = menu && !menu.hidden;

            document.querySelectorAll(".search-select").forEach((other) => {
                if (other !== container) closeSearchSelect(other);
            });

            if (isOpen) {
                closeSearchSelect(container);
            } else {
                renderSearchSelectOptions(container, true);
                setActiveOption(0);
                input?.focus();
            }
        });
    });

    document.addEventListener("click", (event) => {
        document.querySelectorAll(".search-select").forEach((container) => {
            if (!container.contains(event.target)) {
                closeSearchSelect(container);
            }
        });
    });
}

function applyPublicTaxonomy(data) {
    const subjects = [...CURATED_SUBJECTS, ...(data.subjects || [])];
    publicTaxonomy = {
        subjects: normalizeOptions(subjects),
        topics: normalizeOptions(data.collections || []),
        subjectTopics: data.subjectTopics || {}
    };

    document.querySelectorAll(".search-select").forEach((container) => {
        renderSearchSelectOptions(container, false);
    });
}

async function loadPublicTaxonomy() {
    try {
        const url = new URL(apiUrl("/api/public/notes"));
        url.searchParams.set("page", "1");
        url.searchParams.set("pageSize", "1");
        const response = await fetch(url);
        const data = await response.json();
        if (response.ok) applyPublicTaxonomy(data);
    } catch (error) {
        console.error("Unable to load note taxonomy suggestions:", error);
        publicTaxonomy.subjects = [...CURATED_SUBJECTS];
    }
}

const notesState = {
    notes: [],
    uploadNoteId: null,
    editingNoteId: null,
    activeView: "home",
    lastAdminView: "analytics",
    navigationVersion: 0,
    homeLoadVersion: 0,
    uploadInProgress: false,
    createInProgress: false,
    scanRefreshTimer: null,
    replaceFileId: null,
    publicPage: 1,
    publicTotalPages: 1,
    publicPageSize: 18,
    profile: null,
    uploadFeedback: {},
    isAdmin: false,
    dismissedEmptyCreate: false,
    selectedSecurityUserId: null,
    notesLoadVersion: 0,
    savedLoadVersion: 0,
    savedCursor: null,
    studyLoadVersion: 0,
    studyDashboard: null,
    studyActiveSession: null
};

function apiUrl(path) {
    return `${getApiBaseUrl()}${path}`;
}

async function adminFetch(path, options = {}) {
    if (!isAuthenticated()) {
        expireLocalSession();
        throw new Error("Your session expired. Please sign in again.");
    }
    const token = sessionStorage.getItem("id_token");
    if (!token) {
        expireLocalSession();
        throw new Error("Your session expired. Please sign in again.");
    }
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (response.status === 401 && sessionStorage.getItem("id_token") === token) {
        expireLocalSession();
        throw new Error("Your session expired. Please sign in again.");
    }
    return response;
}

async function authenticatedFetch(path, options = {}) {
    if (!isAuthenticated()) {
        expireLocalSession();
        throw new Error("Your session expired. Please sign in again.");
    }
    const token = getAccessToken();
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (response.status === 401 && getAccessToken() === token) {
        expireLocalSession();
        throw new Error("Your session expired. Please sign in again.");
    }
    return response;
}

async function loadProfile() {
    if (!isAuthenticated()) {
        return null;
    }

    const response = await authenticatedFetch("/api/profile");
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Unable to load profile.");
    }

    return data.profile;
}

function showProfilePanel(profile) {
    notesState.profile = profile || null;
    const panel = document.getElementById("profile-panel");

    if (panel) {
        const complete = Boolean(profile?.complete);
        panel.hidden = complete;

        if (!complete) {
            document.getElementById("profile-first-name").value = profile?.firstName || "";
            document.getElementById("profile-last-name").value = profile?.lastName || "";
        }
    }

    const settingsFirst = document.getElementById("settings-first-name");
    const settingsLast = document.getElementById("settings-last-name");
    const preview = document.getElementById("settings-public-preview");
    if (settingsFirst) settingsFirst.value = profile?.firstName || "";
    if (settingsLast) settingsLast.value = profile?.lastName || "";
    const bio = document.getElementById("settings-profile-bio");
    if (bio) bio.value = profile?.bio || "";
    const avatar = profile?.avatarStyle || "indigo";
    const radio = document.querySelector('input[name="profile-avatar-style"][value="' + avatar + '"]');
    if (radio) radio.checked = true;
    if (preview) {
        preview.textContent = profile?.publicAuthor
            ? `Public notes currently show: ${profile.publicAuthor}`
            : "Complete your profile before publishing.";
    }
    updateSettingsAvatarPreview();
    if (notesState.activeView === "settings") loadMyProfileStats();
}

// Account-only shortcut backed by the existing public contributor endpoint.
// Only published, non-moderated notes appear in these public contribution totals.
let myProfileStatsVersion = 0;
async function loadMyProfileStats() {
    const version = ++myProfileStatsVersion;
    const token = getAccessToken();
    const profile = notesState.profile;
    const status = document.getElementById("settings-contributions-status");
    const button = document.getElementById("settings-open-public-profile");
    const published = document.getElementById("settings-published-total");
    const helpful = document.getElementById("settings-helpful-total");
    const subjects = document.getElementById("settings-subjects-total");
    button.disabled = true;
    published.textContent = helpful.textContent = subjects.textContent = "—";
    if (!isAuthenticated() || !profile?.contributorId) {
        status.textContent = "Complete your profile to view your contribution summary.";
        return;
    }
    status.textContent = "Loading published contributions...";
    try {
        const response = await fetch(apiUrl("/api/public/contributors/" + encodeURIComponent(profile.contributorId)));
        const data = await response.json();
        if (version !== myProfileStatsVersion || token !== getAccessToken() || notesState.activeView !== "settings") return;
        if (response.status === 404) {
            published.textContent = helpful.textContent = subjects.textContent = "0";
            status.textContent = "Publish your first note to make your contributor profile visible.";
            return;
        }
        if (!response.ok) throw new Error(data.error || "Could not load contribution statistics.");
        const contributor = data.contributor || {};
        published.textContent = Number(contributor.contributionCount || 0).toLocaleString();
        helpful.textContent = Number(contributor.helpfulCount || 0).toLocaleString();
        subjects.textContent = Number((contributor.subjects || []).length).toLocaleString();
        status.textContent = "";
        button.disabled = false;
    } catch (error) {
        if (version !== myProfileStatsVersion || token !== getAccessToken() || notesState.activeView !== "settings") return;
        status.textContent = "Could not load your contributions. Return to Settings to retry.";
    }
}
function openMyPublicProfile() {
    if (!isAuthenticated() || !notesState.profile?.contributorId) return;
    const contributorId = notesState.profile.contributorId;
    setActiveView("explore", {skipExploreLoad: true});
    openPublicContributor(contributorId);
}

const PROFILE_AVATAR_STYLES = ["indigo", "emerald", "rose", "amber", "slate", "ocean"];

function updateSettingsAvatarPreview() {
    const preview = document.getElementById("settings-avatar-example");
    const label = document.getElementById("settings-avatar-name");
    if (!preview || !label) return;
    const first = document.getElementById("settings-first-name").value.trim();
    const last = document.getElementById("settings-last-name").value.trim();
    const avatarStyle = document.querySelector('input[name="profile-avatar-style"]:checked')?.value || "indigo";
    const safeStyle = PROFILE_AVATAR_STYLES.includes(avatarStyle) ? avatarStyle : "indigo";
    preview.className = "contributor-avatar avatar-" + safeStyle;
    preview.textContent = (first || "?").slice(0, 1).toUpperCase();
    label.textContent = first ? first + (last ? " " + last.slice(0, 1).toUpperCase() + "." : "") : "Your public avatar";
}


async function saveProfile(event) {
    event.preventDefault();

    const firstName = document.getElementById("profile-first-name").value.trim();
    const lastName = document.getElementById("profile-last-name").value.trim();
    const status = document.getElementById("profile-status");
    const button = document.getElementById("profile-submit");

    if (!firstName || !lastName) {
        status.textContent = "First name and last name are required.";
        status.className = "status-text error";
        return;
    }

    button.disabled = true;
    status.textContent = "Saving profile...";
    status.className = "status-text";

    try {
        const response = await authenticatedFetch("/api/profile", {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({firstName, lastName})
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Unable to save profile.");
        }

        status.textContent = `Saved. Public notes will show ${data.profile.publicAuthor}.`;
        status.className = "status-text success";
        showProfilePanel(data.profile);
    } catch (error) {
        status.textContent = error.message || "Unable to save profile.";
        status.className = "status-text error";
    } finally {
        button.disabled = false;
    }
}

async function saveSettingsProfile(event) {
    event.preventDefault();
    const firstName = document.getElementById("settings-first-name").value.trim();
    const lastName = document.getElementById("settings-last-name").value.trim();
    const bio = document.getElementById("settings-profile-bio").value.trim();
    const avatarStyle = document.querySelector('input[name="profile-avatar-style"]:checked')?.value || "indigo";
    const status = document.getElementById("settings-profile-status");
    const button = document.getElementById("settings-profile-submit");
    status.textContent = "";
    status.className = "status-text";

    if (!firstName || !lastName) {
        status.textContent = "First name and last name are required.";
        status.className = "status-text error";
        return;
    }

    button.disabled = true;
    status.textContent = "Saving profile...";
    status.className = "status-text";
    try {
        const response = await authenticatedFetch("/api/profile", {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({firstName, lastName, bio, avatarStyle})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to save profile.");
        showProfilePanel(data.profile);
        status.textContent = `Saved. Public notes will show ${data.profile.publicAuthor}.`;
        status.className = "status-text success";
    } catch (error) {
        status.textContent = error.message || "Unable to save profile.";
        status.className = "status-text error";
    } finally {
        button.disabled = false;
    }
}

// Lightweight private inbox. Fetch on sign-in, focus and bell-open (no polling).
let notificationsRequestVersion = 0;
let notificationsOpen = false;
function resetNotifications() {
    ++notificationsRequestVersion;
    notificationsOpen = false;
    document.getElementById("notifications-panel").hidden = true;
    document.getElementById("notifications-toggle").setAttribute("aria-expanded", "false");
    document.getElementById("notifications-count").hidden = true;
    document.getElementById("notifications-items").replaceChildren();
    document.getElementById("notifications-status").textContent = "";
}
async function loadNotifications() {
    if (!isAuthenticated()) return;
    const version = ++notificationsRequestVersion;
    const token = getAccessToken();
    const status = document.getElementById("notifications-status");
    try {
        const response = await authenticatedFetch("/api/notifications");
        const data = await response.json();
        if (version !== notificationsRequestVersion || token !== getAccessToken() || !isAuthenticated()) return;
        if (!response.ok) throw new Error(data.error || "Unable to load notifications.");
        const badge = document.getElementById("notifications-count");
        const count = Math.max(0, Number(data.unreadCount || 0));
        badge.hidden = !count;
        badge.textContent = count > 99 ? "99+" : String(count);
        document.getElementById("notifications-toggle").setAttribute("aria-label", count ? count + " unread notifications" : "Notifications");
        const list = document.getElementById("notifications-items");
        list.replaceChildren();
        for (const notice of data.notifications || []) {
            const item = document.createElement("div");
            item.className = "notification-item" + (notice.read ? "" : " unread");
            const message = document.createElement("p");
            message.textContent = notice.message || "StudyGrounds update";
            const timestamp = document.createElement("small");
            timestamp.textContent = notice.createdAt ? formatDate(notice.createdAt) : "";
            const actions = document.createElement("div");
            actions.className = "notification-actions";
            const open = document.createElement("button");
            open.type = "button";
            open.className = "button button-text";
            open.textContent = notice.type === "helpful" ? "View note" : "My Notes";
            open.addEventListener("click", async () => {
                if (!notice.read) await markNotificationRead(notice.id);
                toggleNotifications(false);
                if (notice.type === "helpful" && notice.noteId) {
                    setActiveView("explore", {skipExploreLoad:true});
                    openPublicNote(notice.noteId);
                } else {
                    setActiveView("my-notes");
                }
            });
            actions.append(open);
            if (!notice.read) {
                const mark = document.createElement("button");
                mark.type = "button";
                mark.className = "button button-text";
                mark.textContent = "Mark read";
                mark.addEventListener("click", () => markNotificationRead(notice.id));
                actions.append(mark);
            }
            item.append(message, timestamp, actions);
            list.append(item);
        }
        status.textContent = data.notifications?.length ? "" : "You're all caught up.";
    } catch (error) {
        if (version === notificationsRequestVersion) status.textContent = error.message || "Could not load notifications.";
    }
}
async function markNotificationRead(id = null) {
    if (!isAuthenticated()) return;
    try {
        const response = await authenticatedFetch("/api/notifications", {
            method: "PATCH",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify(id ? {id} : {all:true})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to mark notifications read.");
        await loadNotifications();
    } catch (error) {
        document.getElementById("notifications-status").textContent = error.message || "Unable to update notifications.";
    }
}
function toggleNotifications(open) {
    notificationsOpen = open;
    document.getElementById("notifications-panel").hidden = !open;
    document.getElementById("notifications-toggle").setAttribute("aria-expanded", String(open));
    if (open) loadNotifications();
}

const ADMIN_VIEWS = ["analytics", "security", "moderation", "feedback-admin"];
function isCurrentAdminView(view, version) {
    return notesState.activeView === view && notesState.navigationVersion === version;
}

function setActiveView(view, options = {}) {
    if (ADMIN_VIEWS.includes(view) && (!isAuthenticated() || !notesState.isAdmin || !isConfiguredAdmin())) {
        view = "home";
    }
    if (ADMIN_VIEWS.includes(view)) notesState.lastAdminView = view;
    if (notificationsOpen) toggleNotifications(false);
    if (notesState.activeView === "settings" && view !== "settings") {
        ++myProfileStatsVersion;
        const profileStatus = document.getElementById("settings-profile-status");
        profileStatus.textContent = "";
        profileStatus.className = "status-text";
    }
    if (view !== "explore") exitPublicReaderFocus();
    notesState.activeView = view;
    ++notesState.navigationVersion;
    document.getElementById("home-view").hidden = view !== "home";
    document.getElementById("my-notes-view").hidden = view !== "my-notes";
    document.getElementById("explore-view").hidden = view !== "explore";
    document.getElementById("saved-notes-view").hidden = view !== "saved-notes";
    document.getElementById("study-history-view").hidden = view !== "study-history";
    document.getElementById("settings-view").hidden = view !== "settings";
    document.getElementById("analytics-view").hidden = view !== "analytics";
    document.getElementById("security-view").hidden = view !== "security";
    document.getElementById("moderation-view").hidden = view !== "moderation";
    document.getElementById("feedback-view").hidden = view !== "feedback";
    document.getElementById("feedback-admin-view").hidden = view !== "feedback-admin";
    const inAdmin = ADMIN_VIEWS.includes(view);
    document.getElementById("admin-subnav").hidden = !inAdmin;
    document.getElementById("admin-tab").classList.toggle("active", inAdmin);
    if (inAdmin) document.getElementById("admin-tab").setAttribute("aria-current", "page");
    else document.getElementById("admin-tab").removeAttribute("aria-current");
    document.getElementById("home-tab").classList.toggle("active", view === "home");
    document.getElementById("my-notes-tab").classList.toggle("active", view === "my-notes");
    document.getElementById("explore-tab").classList.toggle("active", view === "explore");
    document.getElementById("saved-notes-tab").classList.toggle("active", view === "saved-notes");
    document.getElementById("study-history-tab").classList.toggle("active", view === "study-history");
    document.getElementById("settings-tab").classList.toggle("active", view === "settings");
    document.getElementById("feedback-tab").classList.toggle("active", view === "feedback");
    ADMIN_VIEWS.forEach((name) => {
        const button = document.getElementById(name + "-tab");
        button.classList.toggle("active", view === name);
        button.setAttribute("aria-pressed", String(view === name));
    });
    ["home", "my-notes", "explore", "saved-notes", "study-history", "settings", "feedback"].forEach((name) => {
        const button = document.getElementById(`${name}-tab`);
        if (name === view) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });

    if (view === "home") {
        loadFeaturedHome();
        loadHomeDashboard();
    } else if (view === "explore") {
        if (!options.skipExploreLoad) return loadPublicNotes();
    } else if (view === "settings") {
        loadMyProfileStats();
    } else if (view === "saved-notes") {
        loadSavedNotes();
    } else if (view === "study-history") {
        loadStudyDashboard();
    } else if (view === "analytics") {
        loadAdminAnalytics();
    } else if (view === "security") {
        loadAdminSecurity();
    } else if (view === "moderation") {
        loadAdminModeration();
    } else if (view === "feedback-admin") {
        loadAdminFeedback();
    }
}

function isConfiguredAdmin() {
    const claims = decodeJwtPayload(sessionStorage.getItem("id_token")) || {};
    const email = String(claims.email || "").trim().toLowerCase();
    const allowed = (APP_CONFIG.adminEmails || []).map((item) => String(item).trim().toLowerCase());
    return Boolean(email && allowed.includes(email));
}

function expireLocalSession() {
    ++notesState.notesLoadVersion;
    ++notesState.savedLoadVersion;
    ++notesState.studyLoadVersion;
    ++notesState.homeLoadVersion;
    ++notesState.navigationVersion;
    notesState.studyDashboard = null;
    notesState.studyActiveSession = null;
    document.getElementById("study-continue-list")?.replaceChildren();
    document.getElementById("study-sessions-list")?.replaceChildren();
    notesState.savedCursor = null;
    document.getElementById("saved-notes-grid")?.replaceChildren();
    clearTokens();
    resetNotifications();
    notesState.notes = [];
    notesState.profile = null;
    ++myProfileStatsVersion;
    document.getElementById("settings-open-public-profile").disabled = true;
    ["settings-published-total", "settings-helpful-total", "settings-subjects-total"].forEach(id => {
        document.getElementById(id).textContent = "—";
    });
    document.getElementById("settings-contributions-status").textContent = "";
    notesState.isAdmin = false;
    if (notesState.scanRefreshTimer) {
        window.clearTimeout(notesState.scanRefreshTimer);
        notesState.scanRefreshTimer = null;
    }
    document.getElementById("notes-grid")?.replaceChildren();
    document.getElementById("create-note-panel").hidden = true;
    renderSignedInState();
    updateAuthUi();
}

function renderSignedInState() {
    const signedIn = isAuthenticated();
    if (!signedIn) {
        ++annotationRequestVersion;
        readerAnnotations = [];
        readerSelectedExcerpt = null;
        readerAnnotationsReady = false;
        document.querySelector(".reader-annotations-panel")?.remove();
        document.querySelectorAll(".reader-private-highlight").forEach(mark => {
            mark.replaceWith(document.createTextNode(mark.textContent || ""));
        });
    }
    const signedOutPanel = document.getElementById("signed-out-panel");
    const notesApp = document.getElementById("notes-app");
    const myNotesTab = document.getElementById("my-notes-tab");
    const savedTab = document.getElementById("saved-notes-tab");
    const studyTab = document.getElementById("study-history-tab");
    const settingsTab = document.getElementById("settings-tab");
    const adminTab = document.getElementById("admin-tab");
    const feedbackTab = document.getElementById("feedback-tab");

    signedOutPanel.hidden = signedIn;
    notesApp.hidden = !signedIn;
    myNotesTab.hidden = !signedIn;
    savedTab.hidden = !signedIn;
    studyTab.hidden = !signedIn;
    settingsTab.hidden = !signedIn;
    adminTab.hidden = !signedIn || !notesState.isAdmin || !isConfiguredAdmin();
    feedbackTab.hidden = !signedIn;
    document.getElementById("notifications-control").hidden = !signedIn;
    if (!signedIn) resetNotifications();

    document.getElementById("home-personalized").hidden = !signedIn;
    document.getElementById("home-feedback-card").hidden = !signedIn;
    document.getElementById("home-create").hidden = !signedIn;
    document.getElementById("home-study-card").hidden = !signedIn;
    document.getElementById("home-sign-in").hidden = signedIn;
    document.getElementById("home-welcome").textContent = signedIn ? "Welcome back to StudyGrounds" : "Welcome to StudyGrounds";
    if (!signedIn && ["my-notes", "saved-notes", "study-history", "settings", "feedback", ...ADMIN_VIEWS].includes(notesState.activeView)) {
        setActiveView("home");
    }
}

function showCreatePanel(show) {
    const panel = document.getElementById("create-note-panel");
    panel.hidden = !show;

    if (!show) {
        notesState.editingNoteId = null;
        document.getElementById("create-note-form")?.reset();
        document.getElementById("note-form-title").textContent = "Create a note";
        document.getElementById("note-form-submit").textContent = "Create Note";
    }

    if (show) document.getElementById("note-title")?.focus();
}

function startEditNote(note) {
    notesState.editingNoteId = note.noteId;
    document.getElementById("note-title").value = note.title || "";
    document.getElementById("note-subject").value = note.subject || "";
    document.getElementById("note-collection").value = note.collection || "";
    document.getElementById("note-description").value = note.description || "";
    document.getElementById("note-form-title").textContent = "Edit note";
    document.getElementById("note-form-submit").textContent = "Save Changes";
    setCreateStatus("");
    showCreatePanel(true);
}

function setCreateStatus(message, type = "") {
    const element = document.getElementById("create-note-status");
    element.textContent = message || "";
    element.className = `status-text ${type}`.trim();
}

function showAppNotice(message, type = "info", duration = 4200) {
    const existing = document.querySelector(".app-notice-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = `app-notice-toast ${type}`.trim();
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
        toast.classList.add("leaving");
        window.setTimeout(() => toast.remove(), 220);
    }, duration);
}

function notifyScanStateChanges(notes) {
    const storageKey = "studygrounds_scan_notification_state";
    let previous = {};
    try {
        previous = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
    } catch {
        previous = {};
    }

    const next = {};

    for (const note of notes || []) {
        const noteId = note.noteId;
        if (!noteId) continue;

        const noteKey = `note:${noteId}`;
        const currentNoteState = {
            visibility: note.visibility || "private",
            publishPending: Boolean(note.publishPending),
            publishScanError: note.publishScanError || ""
        };
        const priorNoteState = previous[noteKey];

        if (
            priorNoteState?.publishPending &&
            !currentNoteState.publishPending &&
            currentNoteState.visibility === "public"
        ) {
            showAppNotice(
                `"${note.title || "Your note"}" passed its security scan and is now published.`,
                "success",
                5200
            );
        }

        if (
            currentNoteState.publishScanError &&
            currentNoteState.publishScanError !== priorNoteState?.publishScanError
        ) {
            showAppNotice(
                `"${note.title || "Your note"}" could not be published because a source file did not pass the security scan.`,
                "error",
                7000
            );
        }

        next[noteKey] = currentNoteState;

        for (const file of note.files || []) {
            const fileKey = `file:${noteId}:${file.fileId || file.key || file.filename}`;
            const currentStatus = (file.malwareScanStatus || "").toUpperCase();
            const priorStatus = previous[fileKey] || "";

            if (
                currentStatus &&
                currentStatus !== "PENDING" &&
                currentStatus !== "NO_THREATS_FOUND" &&
                currentStatus !== priorStatus
            ) {
                const threat = currentStatus === "THREATS_FOUND";
                showAppNotice(
                    threat
                        ? `Security alert: "${file.filename || "A source file"}" was blocked because malware was detected.`
                        : `"${file.filename || "A source file"}" could not be cleared by the security scan and remains blocked.`,
                    "error",
                    8000
                );
            }

            next[fileKey] = currentStatus;
        }
    }

    sessionStorage.setItem(storageKey, JSON.stringify(next));
}

function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(date);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function noteMeta(note) {
    return [note.subject, note.collection].filter(Boolean);
}

function fileSecurityLabel(file) {
    const status = (file?.malwareScanStatus || "").toUpperCase();
    if (!status) return "Legacy source";
    if (status === "NO_THREATS_FOUND") return "Security scan passed";
    if (status === "PENDING") return "Security scan in progress";
    if (status === "THREATS_FOUND") return "Blocked: threat detected";
    return "Blocked: scan could not be verified";
}

function setUploadFeedback(noteId, message, type = "") {
    notesState.uploadFeedback[noteId] = {message: message || "", type};
    const status = findUploadStatus(noteId);
    if (status) {
        status.textContent = message || "";
        status.className = `upload-status ${type}`.trim();
    }
}

function validateSourceFile(file) {
    if (!file) return null;

    const allowedTypes = new Set([
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.apple.pages",
        "application/x-iwork-pages-sffpages",
        "application/octet-stream"
    ]);
    const contentType = file.type || "application/octet-stream";
    const maxFileBytes = 20 * 1024 * 1024;

    const filename = (file.name || "").toLowerCase();
    const isPages = filename.endsWith(".pages");
    const pagesMimeAllowed = isPages && [
        "application/vnd.apple.pages",
        "application/x-iwork-pages-sffpages",
        "application/octet-stream"
    ].includes(contentType);

    if (!allowedTypes.has(contentType) || (contentType === "application/octet-stream" && !pagesMimeAllowed)) {
        return "Unsupported file type. Use PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX, or PAGES.";
    }
    if (file.size > maxFileBytes) {
        return "File is too large. Maximum size is 20 MB.";
    }
    return null;
}

function renderEmbeddedSource(file, index = 0) {
    const contentType = (file.contentType || "").toLowerCase();
    const filename = (file.filename || "").toLowerCase();
    const rawViewUrl = file.viewUrl || "";
    const rawDownloadUrl = file.downloadUrl || rawViewUrl;
    const url = escapeHtml(rawViewUrl);
    const downloadUrl = escapeHtml(rawDownloadUrl);
    const name = escapeHtml(file.filename || "Source file");
    const sourceId = `source-${escapeHtml(file.fileId || String(index + 1))}`;

    if (contentType === "application/pdf" || filename.endsWith(".pdf")) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>PDF source</p>
                    </div>
                    <a class="button button-secondary" href="${url}" target="_blank" rel="noopener">
                        Open in Browser ↗
                    </a>
                </div>
                <iframe class="source-pdf-frame" src="${url}#view=FitH" title="${name}"></iframe>
            </section>
        `;
    }

    if (contentType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(filename)) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>Image source</p>
                    </div>
                    <a class="button button-secondary" href="${url}" target="_blank" rel="noopener">
                        Open in Browser ↗
                    </a>
                </div>
                <div class="source-image-wrap">
                    <img class="source-image" src="${url}" alt="${name}">
                </div>
            </section>
        `;
    }

    const isExcel =
        contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        filename.endsWith(".xlsx");

    if (isExcel) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>Excel source · read-only Notes App preview</p>
                    </div>
                    <a class="button button-text" href="${downloadUrl}">
                        Download Original
                    </a>
                </div>
                <div class="native-sheet-preview" data-xlsx-preview data-file-id="${escapeHtml(file.fileId || "")}">
                    <div class="sheet-preview-loading">Loading workbook preview...</div>
                </div>
            </section>
        `;
    }

    const isPowerPoint =
        contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        filename.endsWith(".pptx");

    if (isPowerPoint) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>PowerPoint source · read-only Notes App preview</p>
                    </div>
                    <a class="button button-text" href="${downloadUrl}">
                        Download Original
                    </a>
                </div>
                <div class="native-ppt-preview" data-pptx-preview data-file-id="${escapeHtml(file.fileId || "")}">
                    <div class="ppt-preview-loading">Loading presentation preview...</div>
                </div>
            </section>
        `;
    }


    const isWord =
        contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        filename.endsWith(".docx");

    if (isWord) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>Word source · read-only StudyGrounds preview</p>
                    </div>
                    <a class="button button-text" href="${downloadUrl}">
                        Download Original
                    </a>
                </div>
                <div class="native-document-preview" data-docx-preview data-file-id="${escapeHtml(file.fileId || "")}">
                    <div class="document-preview-loading">Loading Word preview...</div>
                </div>
            </section>
        `;
    }

    const isPages = filename.endsWith(".pages");

    if (isPages) {
        return `
            <section id="${sourceId}" class="source-viewer-card">
                <div class="source-viewer-header">
                    <div>
                        <h3>${name}</h3>
                        <p>Apple Pages source · best-effort read-only StudyGrounds preview</p>
                    </div>
                    <a class="button button-text" href="${downloadUrl}">
                        Download Original
                    </a>
                </div>
                <div class="native-document-preview" data-pages-preview data-file-id="${escapeHtml(file.fileId || "")}">
                    <div class="document-preview-loading">Loading Pages preview...</div>
                </div>
            </section>
        `;
    }

    const isLegacyPowerPoint =
        contentType === "application/vnd.ms-powerpoint" ||
        filename.endsWith(".ppt");

    const isLegacyExcel =
        contentType === "application/vnd.ms-excel" ||
        filename.endsWith(".xls");

    return `
        <section id="${sourceId}" class="source-viewer-card">
            <div class="source-viewer-header">
                <div>
                    <h3>${name}</h3>
                    <p>${isLegacyPowerPoint ? "Legacy PowerPoint source" : isLegacyExcel ? "Legacy Excel source" : "Source file"} · browser preview not available yet.</p>
                </div>
                <a class="button button-text" href="${downloadUrl}">
                    Download Original
                </a>
            </div>
        </section>
    `;
}

function renderSheetTable(sheet) {
    const rows = sheet.rows || [];
    const columnCount = Math.max(
        Number(sheet.columnCount || 0),
        ...rows.map((row) => row.length),
        1
    );

    const headerCells = Array.from({length: columnCount}, (_, index) => {
        let n = index + 1;
        let label = "";
        while (n > 0) {
            n -= 1;
            label = String.fromCharCode(65 + (n % 26)) + label;
            n = Math.floor(n / 26);
        }
        return `<th scope="col">${label}</th>`;
    }).join("");

    const bodyRows = rows.length
        ? rows.map((row, rowIndex) => `
            <tr>
                <th scope="row">${rowIndex + 1}</th>
                ${Array.from({length: columnCount}, (_, colIndex) => `
                    <td>${escapeHtml(row[colIndex] ?? "")}</td>
                `).join("")}
            </tr>
        `).join("")
        : `<tr><th scope="row">1</th><td colspan="${columnCount}">This worksheet is empty.</td></tr>`;

    return `
        <div class="sheet-table-scroll">
            <table class="sheet-preview-table">
                <thead>
                    <tr>
                        <th class="sheet-corner"></th>
                        ${headerCells}
                    </tr>
                </thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
        ${sheet.truncated ? '<p class="sheet-preview-limit">Preview limited to the first 100 rows and 30 columns.</p>' : ""}
    `;
}

async function loadNativeExcelPreviews(noteId) {
    const previews = document.querySelectorAll("[data-xlsx-preview]");

    for (const container of previews) {
        const fileId = container.dataset.fileId;
        if (!fileId) continue;

        try {
            const response = await fetch(
                apiUrl(`/api/public/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}/preview`)
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to preview workbook.");

            const preview = data.preview || {};
            const sheets = preview.sheets || [];

            if (!sheets.length) {
                container.innerHTML = '<p class="sheet-preview-error">No worksheets were available to preview.</p>';
                continue;
            }

            container.innerHTML = `
                <div class="sheet-tabs" role="tablist" aria-label="Workbook sheets">
                    ${sheets.map((sheet, index) => `
                        <button
                            class="sheet-tab ${index === 0 ? "active" : ""}"
                            type="button"
                            data-sheet-index="${index}"
                            role="tab"
                            aria-selected="${index === 0 ? "true" : "false"}"
                        >
                            ${escapeHtml(sheet.name)}
                        </button>
                    `).join("")}
                </div>
                <div class="sheet-preview-content"></div>
            `;

            const content = container.querySelector(".sheet-preview-content");
            const showSheet = (index) => {
                content.innerHTML = renderSheetTable(sheets[index]);
                container.querySelectorAll(".sheet-tab").forEach((button) => {
                    const active = Number(button.dataset.sheetIndex) === index;
                    button.classList.toggle("active", active);
                    button.setAttribute("aria-selected", String(active));
                });
            };

            container.querySelectorAll(".sheet-tab").forEach((button) => {
                button.addEventListener("click", () => showSheet(Number(button.dataset.sheetIndex)));
            });

            showSheet(0);
        } catch (error) {
            container.innerHTML = `
                <p class="sheet-preview-error">
                    ${escapeHtml(error.message || "Unable to preview this workbook.")}
                </p>
            `;
        }
    }
}


function renderPresentationSlides(preview) {
    const slides = preview.slides || [];
    if (!slides.length) {
        return '<p class="ppt-preview-error">No slide text was available to preview.</p>';
    }

    return `
        <div class="ppt-preview-summary">
            <strong>${slides.length} slide${slides.length === 1 ? "" : "s"} previewed</strong>
            ${preview.truncated ? '<span>Preview limited to the first 60 slides.</span>' : ""}
        </div>
        <div class="ppt-slide-jump" role="group" aria-label="Presentation slide navigation">
            <button type="button" class="button button-secondary" data-ppt-previous disabled>← Previous slide</button>
            <label for="ppt-slide-select">View slide</label>
            <select id="ppt-slide-select" aria-label="View slide">
                ${slides.map((slide, index) => `<option value="${index}">Slide ${Number(slide.number || index + 1)}</option>`).join("")}
            </select>
            <button type="button" class="button button-secondary" data-ppt-next ${slides.length === 1 ? "disabled" : ""}>Next slide →</button>
        </div>
        <div class="ppt-slide-list">
            ${slides.map((slide, index) => {
                const body = (slide.text || [])
                    .map((line) => `<li>${escapeHtml(line)}</li>`)
                    .join("");

                return `
                    <article class="ppt-slide-card" data-slide-index="${index}" ${index === 0 ? "" : "hidden"}>
                        <div class="ppt-slide-number">Slide ${Number(slide.number || 0)}</div>
                        <div class="ppt-slide-content">
                            <h4>${escapeHtml(slide.title || `Slide ${slide.number}`)}</h4>
                            ${body ? `<ul>${body}</ul>` : '<p>No additional text on this slide.</p>'}
                        </div>
                    </article>
                `;
            }).join("")}
        </div>
    `;
}

function renderDocumentBlocks(preview) {
    const blocks = preview.blocks || [];
    if (!blocks.length) {
        return '<p class="document-preview-error">No readable document content was available to preview.</p>';
    }

    const renderTable = (block) => {
        const rows = block.rows || [];
        if (!rows.length) {
            return '<div class="document-table-empty">Empty table</div>';
        }
        const columnCount = Math.max(...rows.map((row) => row.length), 1);
        return `
            <div class="document-table-scroll">
                <table class="document-preview-table">
                    <tbody>
                        ${rows.map((row) => `
                            <tr>
                                ${Array.from({length: columnCount}, (_, index) => `
                                    <td>${escapeHtml(row[index] ?? "")}</td>
                                `).join("")}
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
            ${block.truncated ? '<p class="document-preview-limit">Table preview was truncated for safety.</p>' : ""}
        `;
    };

    return `
        <div class="document-preview-toolbar">
            <strong>${preview.type === "pages" ? "Pages preview" : "Word preview"}</strong>
            ${preview.bestEffort ? '<span>Best-effort preview; formatting may differ from the original.</span>' : ""}
            ${preview.truncated ? '<span>Preview truncated for safety.</span>' : ""}
        </div>
        <div class="document-preview-body">
            ${blocks.map((block) => {
                if (block.type === "table") return renderTable(block);
                const text = escapeHtml(block.text || "");
                if (!text) return "";
                if (block.type === "title") return `<h2>${text}</h2>`;
                if (block.type === "subtitle") return `<h3>${text}</h3>`;
                if (block.type === "heading") {
                    const level = Math.min(Math.max(Number(block.headingLevel || 2), 1), 6);
                    return `<h${level}>${text}</h${level}>`;
                }
                return `<p>${text}</p>`;
            }).join("")}
        </div>
    `;
}

async function loadNativeDocumentPreviews(noteId) {
    const previews = document.querySelectorAll("[data-docx-preview], [data-pages-preview]");

    for (const container of previews) {
        const fileId = container.dataset.fileId;
        if (!fileId) continue;

        try {
            const response = await fetch(
                apiUrl(`/api/public/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}/preview`)
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to preview document.");

            container.innerHTML = renderDocumentBlocks(data.preview || {});
        } catch (error) {
            container.innerHTML = `
                <p class="document-preview-error">
                    ${escapeHtml(error.message || "Unable to preview this document.")}
                </p>
            `;
        }
    }
}


async function loadNativePowerPointPreviews(noteId) {
    const previews = document.querySelectorAll("[data-pptx-preview]");

    for (const container of previews) {
        const fileId = container.dataset.fileId;
        if (!fileId) continue;

        try {
            const response = await fetch(
                apiUrl(`/api/public/notes/${encodeURIComponent(noteId)}/files/${encodeURIComponent(fileId)}/preview`)
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to preview presentation.");

            if (!container.isConnected) continue;
            container.innerHTML = renderPresentationSlides(data.preview || {});
            const slideSelect = container.querySelector("#ppt-slide-select");
            const slideCards = [...container.querySelectorAll("[data-slide-index]")];
            const previous = container.querySelector("[data-ppt-previous]");
            const next = container.querySelector("[data-ppt-next]");
            const showSlide = (index) => {
                const active = Math.max(0, Math.min(slideCards.length - 1, index));
                slideCards.forEach((card, position) => { card.hidden = position !== active; });
                slideSelect.value = String(active);
                previous.disabled = active === 0;
                next.disabled = active >= slideCards.length - 1;
            };
            slideSelect?.addEventListener("change", () => showSlide(Number(slideSelect.value)));
            previous?.addEventListener("click", () => showSlide(Number(slideSelect.value) - 1));
            next?.addEventListener("click", () => showSlide(Number(slideSelect.value) + 1));
        } catch (error) {
            container.innerHTML = `
                <p class="ppt-preview-error">
                    ${escapeHtml(error.message || "Unable to preview this presentation.")}
                </p>
            `;
        }
    }
}

function renderNotes() {
    const grid = document.getElementById("notes-grid");
    const status = document.getElementById("notes-status");
    grid.innerHTML = "";

    if (notesState.notes.length === 0) {
        status.hidden = true;

        if (!notesState.dismissedEmptyCreate) {
            document.getElementById("note-form-title").textContent = "Create your first note";
            document.getElementById("note-form-submit").textContent = "Create Note";
            setCreateStatus("");
            showCreatePanel(true);
            return;
        }

        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.innerHTML = `
            <h3>Your library is ready</h3>
            <p>Create your first note whenever you are ready to start publishing or organizing study material.</p>
            <button class="button button-primary" type="button">+ Create Your First Note</button>
        `;
        empty.querySelector("button").addEventListener("click", () => {
            notesState.dismissedEmptyCreate = false;
            showCreatePanel(true);
        });
        grid.appendChild(empty);
        return;
    }

    status.hidden = true;

    notesState.notes.forEach((note) => {
        const card = document.createElement("article");
        card.className = "note-card note-card-owner";
        card.dataset.noteId = note.noteId;

        const meta = noteMeta(note);
        const metaHtml = meta.length
            ? meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("<span>·</span>")
            : "<span>Uncategorized</span>";

        const files = note.files || [];
        const fileCount = files.length;
        const published = note.visibility === "public";
        const moderationHeld = Boolean(note.moderationHold);
        const pendingSecurityScan = files.some((file) => file.malwareScanStatus === "PENDING");
        const failedSecurityScan = files.some((file) => {
            const status = file.malwareScanStatus;
            return status && status !== "PENDING" && status !== "NO_THREATS_FOUND";
        });
        const queuedForPublish = Boolean(note.publishPending);
        const publishBlocked = !published && failedSecurityScan;
        const publishDisabled = moderationHeld || publishBlocked || queuedForPublish;
        const securityStatusText = queuedForPublish
            ? "Will publish automatically after scan"
            : pendingSecurityScan
                ? "Security scan in progress"
                : failedSecurityScan
                    ? "Security scan failed"
                    : "";
        const createdDate = note.publishedAt || note.createdAt;

        const sourceListHtml = files.length
            ? `
                <div class="owner-source-list owner-source-list-compact">
                    ${files.map((file) => `
                        <div class="owner-source-row">
                            <div class="owner-source-info">
                                <span title="${escapeHtml(file.filename || "Source file")}">
                                    ${escapeHtml(file.filename || "Source file")}
                                </span>
                                <small>${escapeHtml(formatBytes(file.sizeBytes))} · ${escapeHtml(fileSecurityLabel(file))}</small>
                            </div>
                            <div class="source-actions">
                                <button class="button button-mini" type="button" data-move-source="up" data-file-id="${escapeHtml(file.fileId || "")}" title="Move up">↑</button>
                                <button class="button button-mini" type="button" data-move-source="down" data-file-id="${escapeHtml(file.fileId || "")}" title="Move down">↓</button>
                                <button class="button button-mini" type="button" data-rename-source data-file-id="${escapeHtml(file.fileId || "")}">Rename</button>
                                <button class="button button-mini" type="button" data-replace-source data-file-id="${escapeHtml(file.fileId || "")}">Replace</button>
                                <button class="button button-danger-text" type="button" data-remove-source data-file-id="${escapeHtml(file.fileId || "")}" ${published ? 'disabled title="Unpublish this note before removing source files."' : ""}>Remove</button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            `
            : '<p class="manage-empty">No source files attached yet.</p>';

        card.innerHTML = `
            <div class="owner-card-header">
                <span class="badge ${moderationHeld ? "moderation-held" : ""}">${escapeHtml(moderationHeld ? "Removed by moderation" : (note.visibility || "private"))}</span>
                <span class="note-date">${escapeHtml(formatDate(createdDate))}</span>
            </div>

            <div class="owner-card-body">
                <h3>${escapeHtml(note.title || "Untitled Note")}</h3>
                <div class="note-meta">${metaHtml}</div>
                <p class="owner-note-description">${escapeHtml(note.description || "No description yet.")}</p>
                ${moderationHeld ? `
                    <div class="moderation-owner-notice">
                        <strong>Removed by StudyGrounds moderation</strong>
                        <span>${escapeHtml(note.moderationReason || "This note is not eligible to be published right now.")}</span>
                    </div>
                ` : ""}
            </div>

            <div class="owner-card-summary">
                <span>${fileCount} source file${fileCount === 1 ? "" : "s"}</span>
                <span class="upload-status ${escapeHtml(notesState.uploadFeedback[note.noteId]?.type || "")}" data-upload-status>${escapeHtml(notesState.uploadFeedback[note.noteId]?.message || securityStatusText)}</span>
            </div>

            <div class="owner-card-actions">
                <button class="button button-primary owner-primary-action" type="button" data-edit-note>Edit Note</button>
                <button
                    class="button button-secondary"
                    type="button"
                    data-publish-note
                    ${publishDisabled ? 'disabled' : ""}
                    ${moderationHeld ? 'title="This note was removed by moderation and must be restored by an admin before it can be published again."' : ""}
                    ${publishBlocked ? 'title="This source did not pass its security scan."' : ""}
                    ${queuedForPublish ? 'title="This note will publish automatically when the security scan passes."' : ""}
                >
                    ${published ? "Unpublish" : moderationHeld ? "Removed" : queuedForPublish ? "Publishing after scan…" : "Publish"}
                </button>
                <button class="button button-text manage-toggle" type="button" data-manage-note aria-expanded="false">
                    Manage ▾
                </button>
            </div>

            <div class="owner-manage-panel" data-manage-panel hidden>
                <div class="owner-manage-section">
                    <div class="owner-manage-heading">
                        <div>
                            <strong>Source files</strong>
                            <span>${fileCount}/10</span>
                        </div>
                        <button class="button button-secondary" type="button" data-upload-note ${notesState.uploadInProgress ? "disabled" : ""}>
                            ${notesState.uploadInProgress ? "Upload in progress…" : "+ Add Source"}
                        </button>
                    </div>
                    ${sourceListHtml}
                </div>

                <div class="owner-danger-row">
                    <span>Delete this note and all of its source files.</span>
                    <button class="button button-danger" type="button" data-delete-note>Delete Note</button>
                </div>
            </div>
        `;

        card.querySelector("[data-edit-note]").addEventListener("click", () => {
            startEditNote(note);
        });

        card.querySelector("[data-manage-note]").addEventListener("click", (event) => {
            const button = event.currentTarget;
            const panel = card.querySelector("[data-manage-panel]");
            const opening = panel.hidden;
            panel.hidden = !opening;
            button.setAttribute("aria-expanded", String(opening));
            button.textContent = opening ? "Manage ▴" : "Manage ▾";
        });

        card.querySelectorAll("[data-rename-source]").forEach((button) => {
            button.addEventListener("click", () => renameSourceFile(note, button.dataset.fileId));
        });

        card.querySelectorAll("[data-move-source]").forEach((button) => {
            button.addEventListener("click", () => moveSourceFile(note, button.dataset.fileId, button.dataset.moveSource));
        });

        card.querySelectorAll("[data-replace-source]").forEach((button) => {
            button.addEventListener("click", () => {
                if (notesState.uploadInProgress) {
                    alert("Please wait for the current upload to finish.");
                    return;
                }
                notesState.uploadNoteId = note.noteId;
                notesState.replaceFileId = button.dataset.fileId || null;
                const input = document.getElementById("note-upload-input");
                input.value = "";
                input.click();
            });
        });

        card.querySelectorAll("[data-remove-source]").forEach((button) => {
            button.addEventListener("click", () => {
                const fileId = button.dataset.fileId;
                if (fileId) deleteSourceFile(note, fileId);
            });
        });

        card.querySelector("[data-upload-note]").addEventListener("click", () => {
            if (notesState.uploadInProgress) {
                alert("Please wait for the current upload to finish before starting another one.");
                return;
            }

            if (fileCount >= 10) {
                alert("A note can have at most 10 source files.");
                return;
            }

            notesState.uploadNoteId = note.noteId;
            notesState.replaceFileId = null;
            const input = document.getElementById("note-upload-input");
            input.value = "";
            input.click();
        });

        card.querySelector("[data-publish-note]").addEventListener("click", () => {
            setPublished(note.noteId, !published);
        });

        card.querySelector("[data-delete-note]").addEventListener("click", () => {
            deleteNote(note);
        });

        grid.appendChild(card);
    });
}

function setNotesStatus(message, isError = false) {
    const status = document.getElementById("notes-status");
    status.hidden = false;
    status.textContent = message;
    status.style.color = isError ? "#b42318" : "";
}

function clearCompletedScanUploadFeedback(notes) {
    for (const note of notes || []) {
        const feedback = notesState.uploadFeedback[note.noteId];
        if (!feedback || !/^(Uploaded|Replaced)\. Security scan in progress/.test(feedback.message || "")) continue;
        const pending = Boolean(note.publishPending) ||
            (note.files || []).some((file) => (file.malwareScanStatus || "").toUpperCase() === "PENDING");
        if (!pending) delete notesState.uploadFeedback[note.noteId];
    }
}

async function loadNotes() {
    const requestVersion = ++notesState.notesLoadVersion;
    if (!isAuthenticated()) {
        notesState.notes = [];
        renderSignedInState();
        return;
    }

    const requestToken = getAccessToken();
    setNotesStatus("Loading your notes...");

    try {
        const response = await authenticatedFetch("/api/notes");
        if (requestVersion !== notesState.notesLoadVersion || requestToken !== getAccessToken()) return;
        if (!response.ok) throw new Error(await response.text() || `Unable to load notes (${response.status})`);

        const data = await response.json();
        if (requestVersion !== notesState.notesLoadVersion || requestToken !== getAccessToken()) return;
        notesState.notes = data.notes || [];
        personalTaxonomy = {
            subjects: normalizeOptions(data.taxonomy?.subjects || []),
            topics: normalizeOptions(data.taxonomy?.collections || []),
            subjectTopics: data.taxonomy?.subjectTopics || {}
        };
        document.querySelectorAll(".search-select").forEach((container) => {
            renderSearchSelectOptions(container, false);
        });
        notifyScanStateChanges(notesState.notes);
        clearCompletedScanUploadFeedback(notesState.notes);
        renderNotes();

        if (notesState.scanRefreshTimer) {
            window.clearTimeout(notesState.scanRefreshTimer);
            notesState.scanRefreshTimer = null;
        }

        const hasPendingScan = notesState.notes.some((note) =>
            Boolean(note.publishPending) ||
            (note.files || []).some((file) => file.malwareScanStatus === "PENDING")
        );

        if (hasPendingScan) {
            notesState.scanRefreshTimer = window.setTimeout(() => {
                notesState.scanRefreshTimer = null;
                if (isAuthenticated()) loadNotes();
            }, 4000);
        }
    } catch (error) {
        if (requestVersion !== notesState.notesLoadVersion || requestToken !== getAccessToken()) return;
        console.error("Unable to load notes:", error);
        setNotesStatus(error.message || "Unable to load your notes.", true);
    }
}

async function createNote(event) {
    event.preventDefault();

    if (notesState.createInProgress) {
        return;
    }

    notesState.createInProgress = true;
    const form = event.currentTarget;
    const title = document.getElementById("note-title").value.trim();
    const subject = document.getElementById("note-subject").value.trim();
    const collection = document.getElementById("note-collection").value.trim();
    const description = document.getElementById("note-description").value.trim();
    const sourceFile = document.getElementById("note-form-source").files?.[0] || null;
    const publishAfterSave = document.getElementById("note-form-publish").checked;
    const submitButton = form.querySelector('button[type="submit"]');
    const editingNoteId = notesState.editingNoteId;

    if (!title) {
        setCreateStatus("A title is required.", "error");
        notesState.createInProgress = false;
        return;
    }

    const sourceValidationError = validateSourceFile(sourceFile);
    if (sourceValidationError) {
        setCreateStatus(sourceValidationError, "error");
        notesState.createInProgress = false;
        return;
    }

    if (sourceFile && notesState.uploadInProgress) {
        setCreateStatus("Please wait for the current upload to finish.", "error");
        notesState.createInProgress = false;
        return;
    }

    submitButton.disabled = true;
    setCreateStatus(editingNoteId ? "Saving changes..." : "Creating note...");

    try {
        const response = await authenticatedFetch(
            editingNoteId ? `/api/notes/${encodeURIComponent(editingNoteId)}` : "/api/notes",
            {
                method: editingNoteId ? "PATCH" : "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({title, subject, collection, description})
            }
        );

        const data = await response.json();
        if (!response.ok) {
            throw new Error(
                data.error || (editingNoteId ? "Unable to update note." : "Unable to create note.")
            );
        }

        const targetNoteId = editingNoteId || data.note?.noteId;

        if (sourceFile && targetNoteId) {
            notesState.uploadInProgress = true;
            setCreateStatus("Uploading source file...");
            const uploadOk = await uploadFileForNote(
                sourceFile,
                targetNoteId,
                null,
                document.getElementById("create-note-status")
            );
            notesState.uploadInProgress = false;

            if (!uploadOk) {
                notesState.editingNoteId = targetNoteId;
                document.getElementById("note-form-title").textContent = "Edit note";
                document.getElementById("note-form-submit").textContent = "Save Changes";
                await loadNotes();
                return;
            }
        }

        if (publishAfterSave && targetNoteId) {
            setCreateStatus("Publishing note...");
            const publishResponse = await authenticatedFetch(
                `/api/notes/${encodeURIComponent(targetNoteId)}/publish`,
                {
                    method: "PATCH",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({published: true})
                }
            );
            const publishData = await publishResponse.json();
            if (!publishResponse.ok) {
                notesState.editingNoteId = targetNoteId;
                document.getElementById("note-form-title").textContent = "Edit note";
                document.getElementById("note-form-submit").textContent = "Save Changes";
                throw new Error(publishData.error || "Note saved, but could not be published.");
            }

            if (publishData.publishPending) {
                showAppNotice("Note saved. Your file is being security scanned and will publish automatically when the scan passes.");
            } else {
                showAppNotice("Note saved and published.");
            }
        } else if (sourceFile && targetNoteId) {
            showAppNotice("Note saved. Your file is being security scanned; you can publish it once the scan passes.");
        }

        notesState.editingNoteId = null;
        notesState.dismissedEmptyCreate = false;
        form.reset();
        showCreatePanel(false);
        await loadNotes();
    } catch (error) {
        notesState.uploadInProgress = false;
        setCreateStatus(
            error.message || (editingNoteId ? "Unable to update note." : "Unable to create note."),
            "error"
        );
    } finally {
        notesState.createInProgress = false;
        submitButton.disabled = false;
    }
}

function findUploadStatus(noteId) {
    return document
        .querySelector(`.note-card[data-note-id="${CSS.escape(noteId)}"]`)
        ?.querySelector("[data-upload-status]") || null;
}

async function uploadFileForNote(file, noteId, replaceFileId = null, statusOverride = null) {
    const status = statusOverride || findUploadStatus(noteId);
    const contentType = file.type || "application/octet-stream";

    const updateStatus = (message, type = "") => {
        if (!statusOverride) {
            setUploadFeedback(noteId, message, type);
        }
        if (status) {
            status.textContent = message || "";
            status.className = statusOverride
                ? `status-text ${type}`.trim()
                : `upload-status ${type}`.trim();
        }
    };

    const validationError = validateSourceFile(file);
    if (validationError) {
        updateStatus(validationError, "error");
        return false;
    }

    updateStatus("Preparing upload...");

    try {
        const presignResponse = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(noteId)}/upload`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    filename: file.name,
                    contentType,
                    fileSize: file.size,
                    replaceFileId
                })
            }
        );

        const presign = await presignResponse.json();
        if (!presignResponse.ok) throw new Error(presign.error || "Unable to prepare upload.");

        updateStatus("Uploading...");

        const uploadBody = new FormData();
        Object.entries(presign.uploadFields || {}).forEach(([name, value]) => {
            uploadBody.append(name, value);
        });
        uploadBody.append("file", file);

        const uploadResponse = await fetch(presign.uploadUrl, {
            method: "POST",
            body: uploadBody
        });

        if (!uploadResponse.ok) {
            if (uploadResponse.status === 400 || uploadResponse.status === 403) {
                throw new Error("Upload rejected: file must be an allowed type and no larger than 20 MB.");
            }
            throw new Error(`Upload failed with status ${uploadResponse.status}.`);
        }

        updateStatus("Saving file...");
        const registerResponse = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(noteId)}/files`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    key: presign.key,
                    filename: file.name,
                    contentType,
                    replaceFileId
                })
            }
        );

        const registered = await registerResponse.json();
        if (!registerResponse.ok) throw new Error(registered.error || "Uploaded, but could not register file.");

        updateStatus(
            replaceFileId
                ? "Replaced. Security scan in progress…"
                : "Uploaded. Security scan in progress…",
            "success"
        );
        await loadNotes();
        return true;
    } catch (error) {
        console.error("Upload failed:", error);
        updateStatus(error.message || "Upload failed", "error");
        return false;
    }
}

async function handleUploadSelection(event) {
    const file = event.target.files?.[0];
    const noteId = notesState.uploadNoteId;
    const replaceFileId = notesState.replaceFileId;
    if (!file || !noteId) return;

    if (notesState.uploadInProgress) {
        alert("Please wait for the current upload to finish before starting another one.");
        return;
    }

    notesState.uploadInProgress = true;
    renderNotes();

    try {
        await uploadFileForNote(file, noteId, replaceFileId);
    } finally {
        notesState.uploadInProgress = false;
        notesState.uploadNoteId = null;
        notesState.replaceFileId = null;
        renderNotes();
    }
}

async function updateSourceFile(note, fileId, payload) {
    try {
        const response = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(note.noteId)}/files/${encodeURIComponent(fileId)}`,
            {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(payload)
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to update source file.");
        await loadNotes();
    } catch (error) {
        alert(error.message || "Unable to update source file.");
    }
}

async function renameSourceFile(note, fileId) {
    const file = (note.files || []).find((item) => item.fileId === fileId);
    if (!file) return;
    const filename = window.prompt("Rename source file:", file.filename || "");
    if (filename === null) return;
    const trimmed = filename.trim();
    if (!trimmed) {
        alert("Filename cannot be empty.");
        return;
    }
    await updateSourceFile(note, fileId, {action: "rename", filename: trimmed});
}

async function moveSourceFile(note, fileId, direction) {
    await updateSourceFile(note, fileId, {action: "move", direction});
}

async function deleteSourceFile(note, fileId) {
    if (note.visibility === "public") {
        alert("Unpublish this note before removing a source file.");
        return;
    }

    const file = (note.files || []).find((item) => item.fileId === fileId);
    const filename = file?.filename || "this source file";

    if (!window.confirm(`Remove "${filename}" from this note? This deletes the stored file too.`)) {
        return;
    }

    try {
        const response = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(note.noteId)}/files/${encodeURIComponent(fileId)}`,
            {method: "DELETE"}
        );

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Unable to remove source file.");
        }

        await loadNotes();

        if (notesState.activeView === "explore") {
            await loadPublicNotes();
        }
    } catch (error) {
        alert(error.message || "Unable to remove source file.");
    }
}

async function deleteNote(note) {
    const warning = note.visibility === "public"
        ? `Delete "${note.title}"? It is currently public and will disappear from Explore immediately. Its stored source files will also be deleted.`
        : `Delete "${note.title}"? Its stored source files will also be deleted.`;

    if (!window.confirm(warning)) {
        return;
    }

    try {
        const response = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(note.noteId)}`,
            {method: "DELETE"}
        );

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Unable to delete note.");
        }

        await loadNotes();

        if (notesState.activeView === "explore") {
            await loadPublicNotes();
        }
    } catch (error) {
        alert(error.message || "Unable to delete note.");
    }
}

async function setPublished(noteId, published) {
    try {
        const response = await authenticatedFetch(
            `/api/notes/${encodeURIComponent(noteId)}/publish`,
            {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({published})
            }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to update publishing status.");

        if (data.publishPending) {
            showAppNotice("Publishing is queued. This note will go public automatically when the security scan passes.");
        }

        await loadNotes();
        if (notesState.activeView === "explore") await loadPublicNotes();
    } catch (error) {
        alert(error.message || "Unable to update publishing status.");
    }
}

async function probeAdminAccess() {
    if (!isAuthenticated()) {
        notesState.isAdmin = false;
        renderSignedInState();
        return false;
    }
    try {
        const response = await adminFetch("/api/admin/analytics?probe=1");
        notesState.isAdmin = response.ok && isConfiguredAdmin();
        renderSignedInState();
        if (!notesState.isAdmin && ADMIN_VIEWS.includes(notesState.activeView)) setActiveView("home");
        return notesState.isAdmin;
    } catch (error) {
        notesState.isAdmin = false;
        renderSignedInState();
        if (ADMIN_VIEWS.includes(notesState.activeView)) setActiveView("home");
        console.error("Unable to check admin access:", error);
        return false;
    }
}

function renderAnalyticsList(elementId, items, emptyText) {
    const element = document.getElementById(elementId);
    if (!element) return;

    if (!items?.length) {
        element.innerHTML = `<p class="note-description">${escapeHtml(emptyText)}</p>`;
        return;
    }

    element.innerHTML = items.map((item) => `
        <div class="analytics-list-row">
            <span>${escapeHtml(item.label)}</span>
            <strong>${Number(item.count || 0)}</strong>
        </div>
    `).join("");
}

async function loadAdminAnalytics() {
    const navVersion = notesState.navigationVersion;
    const status = document.getElementById("analytics-status");
    const content = document.getElementById("analytics-content");
    status.hidden = false;
    status.textContent = "Loading analytics...";
    status.style.color = "";
    content.hidden = true;

    try {
        const response = await adminFetch("/api/admin/analytics");
        let data = {};
        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (!isCurrentAdminView("analytics", navVersion)) return;
        if (response.status === 403) {
            notesState.isAdmin = false;
            renderSignedInState();
            setActiveView("home");
            return;
        }
        if (!response.ok) {
            const detail = data.detail ? ` — ${data.detail}` : "";
            throw new Error((data.error || `Unable to load analytics (HTTP ${response.status}).`) + detail);
        }

        const metrics = data.metrics || {};
        document.getElementById("metric-users").textContent = Number(metrics.users || 0);
        document.getElementById("metric-notes").textContent = Number(metrics.notes || 0);
        document.getElementById("metric-public-notes").textContent = Number(metrics.publicNotes || 0);
        document.getElementById("metric-private-notes").textContent = Number(metrics.privateNotes || 0);
        document.getElementById("metric-source-files").textContent = Number(metrics.sourceFiles || 0);
        document.getElementById("metric-storage").textContent = formatBytes(metrics.storageBytes || 0) || "0 B";
        document.getElementById("metric-views").textContent = Number(metrics.views || 0);
        document.getElementById("metric-average-files").textContent = Number(metrics.averageFilesPerNote || 0).toFixed(2);

        const warnings = data.warnings || [];
        if (warnings.length) {
            status.hidden = false;
            status.textContent = warnings.map((warning) => warning.message).join(" ");
            status.style.color = "#b54708";
        }

        renderAnalyticsList("analytics-subjects", data.topSubjects || [], "No subjects yet.");
        renderAnalyticsList("analytics-collections", data.topCollections || [], "No topics yet.");

        const recent = document.getElementById("analytics-recent");
        if (!(data.recentPublished || []).length) {
            recent.innerHTML = '<p class="note-description">No published notes yet.</p>';
        } else {
            recent.innerHTML = data.recentPublished.map((note) => `
                <div class="analytics-recent-row">
                    <div>
                        <strong>${escapeHtml(note.title || "Untitled note")}</strong>
                        <span>${escapeHtml([note.subject, note.collection].filter(Boolean).join(" · "))}</span>
                    </div>
                    <div class="analytics-recent-meta">
                        <span>${Number(note.viewCount || 0)} views</span>
                        <span>${Number(note.fileCount || 0)} files</span>
                        <span>${escapeHtml(formatDate(note.publishedAt))}</span>
                    </div>
                </div>
            `).join("");
        }

        if (!(data.warnings || []).length) {
            status.hidden = true;
        }
        content.hidden = false;
    } catch (error) {
        status.textContent = error.message || "Unable to load analytics.";
        status.style.color = "#b42318";
    }
}


function securityStatusLabel(user) {
    const status = user?.accountSecurityStatus || "ACTIVE";
    if (status === "DISABLED") return "Disabled";
    if (status === "RESTRICTED") return "Restricted";
    if (status === "REVIEW_REQUIRED") return "Needs review";
    return "Active";
}

function securityStatusClass(user) {
    const status = user?.accountSecurityStatus || "ACTIVE";
    if (status === "DISABLED") return "disabled";
    if (status === "RESTRICTED") return "restricted";
    if (status === "REVIEW_REQUIRED") return "review";
    return "active";
}

function formatSecurityDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function renderSecurityUsers(users) {
    const container = document.getElementById("security-users");
    if (!users?.length) {
        container.innerHTML = '<p class="note-description">No security incidents or account restrictions have been recorded.</p>';
        return;
    }

    container.innerHTML = users.map((user) => {
        const statusClass = securityStatusClass(user);
        const email = user.email || user.userId || "Unknown user";
        const restrictionBits = [];
        if (user.uploadBlocked || user.uploadBlockedUntil) restrictionBits.push("uploads");
        if (user.publishingBlocked) restrictionBits.push("publishing");
        if (user.cognitoEnabled === false) restrictionBits.push("account");

        return `
            <button class="security-user-row" type="button" data-security-user="${escapeHtml(user.userId)}">
                <div class="security-user-main">
                    <div class="security-user-heading">
                        <strong>${escapeHtml(email)}</strong>
                        <span class="security-badge ${statusClass}">${escapeHtml(securityStatusLabel(user))}</span>
                    </div>
                    <span>${Number(user.malwareStrikeCount30d || 0)} strike${Number(user.malwareStrikeCount30d || 0) === 1 ? "" : "s"} / 30 days</span>
                </div>
                <div class="security-user-meta">
                    <span>${restrictionBits.length ? `Blocked: ${restrictionBits.join(", ")}` : "No active block"}</span>
                    <span>Last incident: ${escapeHtml(formatSecurityDateTime(user.lastMalwareAt))}</span>
                </div>
            </button>
        `;
    }).join("");

    container.querySelectorAll("[data-security-user]").forEach((button) => {
        button.addEventListener("click", () => loadSecurityUser(button.dataset.securityUser));
    });
}

function renderSecurityUserDetail(data) {
    const user = data.user || {};
    notesState.selectedSecurityUserId = user.userId || null;

    const detail = document.getElementById("security-user-detail");
    const email = user.email || user.userId || "Unknown user";
    document.getElementById("security-detail-title").textContent = email;
    document.getElementById("security-detail-subtitle").textContent =
        `${securityStatusLabel(user)} · ${Number(user.malwareStrikeCount30d || 0)} strike${Number(user.malwareStrikeCount30d || 0) === 1 ? "" : "s"} in the last 30 days`;

    const summary = document.getElementById("security-detail-summary");
    summary.innerHTML = `
        <div><span>Status</span><strong class="security-badge ${securityStatusClass(user)}">${escapeHtml(securityStatusLabel(user))}</strong></div>
        <div><span>Uploads</span><strong>${user.uploadBlocked || user.uploadBlockedUntil ? "Blocked" : "Allowed"}</strong></div>
        <div><span>Publishing</span><strong>${user.publishingBlocked ? "Blocked" : "Allowed"}</strong></div>
        <div><span>Cognito account</span><strong>${user.cognitoEnabled === false ? "Disabled" : "Enabled"}</strong></div>
        <div><span>Last malware</span><strong>${escapeHtml(formatSecurityDateTime(user.lastMalwareAt))}</strong></div>
        <div><span>Upload pause until</span><strong>${escapeHtml(formatSecurityDateTime(user.uploadBlockedUntil))}</strong></div>
    `;

    document.getElementById("security-reenable-account").disabled = user.cognitoEnabled !== false;
    document.getElementById("security-disable-account").disabled = user.cognitoEnabled === false;
    document.getElementById("security-restore-access").disabled =
        !user.uploadBlocked && !user.uploadBlockedUntil && !user.publishingBlocked && !user.reviewRequired;
    document.getElementById("security-forgive-strikes").disabled =
        Number(user.malwareStrikeCount30d || 0) === 0;

    const incidents = document.getElementById("security-incidents");
    if (!(data.incidents || []).length) {
        incidents.innerHTML = '<p class="note-description">No incidents recorded.</p>';
    } else {
        incidents.innerHTML = data.incidents.map((incident) => `
            <article class="security-history-item">
                <div class="security-history-heading">
                    <strong>${escapeHtml(incident.filename || "Source file")}</strong>
                    <span class="security-badge ${incident.forgiven ? "active" : "review"}">${incident.forgiven ? "Forgiven" : "Threat found"}</span>
                </div>
                <span>${escapeHtml(incident.noteTitle || "Deleted note")}</span>
                <span>${escapeHtml(formatSecurityDateTime(incident.detectedAt))}</span>
                ${incident.forgiven ? `<small>Forgiven ${escapeHtml(formatSecurityDateTime(incident.forgivenAt))} by ${escapeHtml(incident.forgivenBy || "admin")}</small>` : ""}
            </article>
        `).join("");
    }

    const audit = document.getElementById("security-audit");
    if (!(data.audit || []).length) {
        audit.innerHTML = '<p class="note-description">No admin actions recorded.</p>';
    } else {
        audit.innerHTML = data.audit.map((item) => `
            <article class="security-history-item">
                <div class="security-history-heading">
                    <strong>${escapeHtml(String(item.action || "").replaceAll("_", " "))}</strong>
                </div>
                <span>${escapeHtml(item.adminEmail || "Admin")}</span>
                <span>${escapeHtml(formatSecurityDateTime(item.createdAt))}</span>
            </article>
        `).join("");
    }

    detail.hidden = false;
    detail.scrollIntoView({behavior: "smooth", block: "start"});
}

async function loadSecurityUser(userId) {
    if (!userId) return;

    try {
        const response = await adminFetch(`/api/admin/security/${encodeURIComponent(userId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load security details.");
        renderSecurityUserDetail(data);
    } catch (error) {
        showAppNotice(error.message || "Unable to load security details.", "error", 6500);
    }
}

async function applySecurityAction(action) {
    const userId = notesState.selectedSecurityUserId;
    if (!userId) return;

    const messages = {
        restore_access: "Restore uploads and publishing for this account? Existing incident history and strikes will remain.",
        forgive_strikes: "Forgive this account's current strikes? Incident history will remain in the audit record.",
        reenable_account: "Re-enable this Cognito account and restore StudyGrounds access?",
        disable_account: "Disable this Cognito account and block uploads and publishing?"
    };
    if (!window.confirm(messages[action] || "Apply this security action?")) return;

    try {
        const response = await adminFetch(`/api/admin/security/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({action})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to apply security action.");

        renderSecurityUserDetail(data);
        await loadAdminSecurity(false);
        showAppNotice("Security action applied and recorded in the audit trail.", "success", 5200);
    } catch (error) {
        showAppNotice(error.message || "Unable to apply security action.", "error", 7000);
    }
}

async function loadAdminSecurity(hideDetail = true) {
    const navVersion = notesState.navigationVersion;
    const status = document.getElementById("security-status");
    const content = document.getElementById("security-content");
    status.hidden = false;
    status.textContent = "Loading security records...";
    status.style.color = "";
    content.hidden = true;

    if (hideDetail) {
        document.getElementById("security-user-detail").hidden = true;
        notesState.selectedSecurityUserId = null;
    }

    try {
        const response = await adminFetch("/api/admin/security");
        const data = await response.json();
        if (!isCurrentAdminView("security", navVersion)) return;

        if (response.status === 403) {
            notesState.isAdmin = false;
            renderSignedInState();
            setActiveView("home");
            return;
        }

        if (!response.ok) {
            throw new Error(data.error || `Unable to load security records (HTTP ${response.status}).`);
        }

        const metrics = data.metrics || {};
        document.getElementById("security-metric-review").textContent = Number(metrics.reviewRequired || 0);
        document.getElementById("security-metric-restricted").textContent = Number(metrics.restricted || 0);
        document.getElementById("security-metric-disabled").textContent = Number(metrics.disabled || 0);
        document.getElementById("security-metric-strikes").textContent = Number(metrics.strikes30d || 0);
        renderSecurityUsers(data.users || []);

        status.hidden = true;
        content.hidden = false;
    } catch (error) {
        if (!isCurrentAdminView("security", navVersion)) return;
        status.textContent = error.message || "Unable to load security records.";
        status.style.color = "#b42318";
    }
}

function showCopyToast(event) {
    const toast = document.createElement("div");
    toast.className = "copy-toast";
    toast.textContent = "Copied";
    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? 80;
    toast.style.left = `${Math.min(x + 10, window.innerWidth - 90)}px`;
    toast.style.top = `${Math.min(y + 10, window.innerHeight - 50)}px`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1100);
}

function setPublicStatus(message, isError = false) {
    const status = document.getElementById("public-status");
    status.hidden = false;
    status.textContent = message;
    status.style.color = isError ? "#b42318" : "";
}

function refreshExploreTopicFilter() {
    const subjectSelect = document.getElementById("public-subject");
    const topicSelect = document.getElementById("public-collection");
    if (!subjectSelect || !topicSelect) return;

    const selectedSubject = subjectSelect.value;
    const currentTopic = topicSelect.value;

    let topics = publicTaxonomy.topics || [];
    if (selectedSubject) {
        const subjectKey = Object.keys(publicTaxonomy.subjectTopics || {}).find(
            (key) => key.toLowerCase() === selectedSubject.toLowerCase()
        );
        topics = subjectKey ? publicTaxonomy.subjectTopics[subjectKey] : [];
    }

    const normalizedTopics = normalizeOptions(topics);
    topicSelect.innerHTML = ['<option value="">All topics</option>']
        .concat(
            normalizedTopics.map(
                (item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
            )
        )
        .join("");

    topicSelect.value = normalizedTopics.includes(currentTopic) ? currentTopic : "";
}

let exploreReturnScrollY = null;

function rememberExplorePosition() {
    const grid = document.getElementById("public-grid");
    if (notesState.activeView === "explore" && grid && !grid.hidden) {
        exploreReturnScrollY = window.scrollY;
    }
}

async function backToExplore() {
    exitPublicReaderFocus();
    activePublicReader = null;
    ++sourceRenderVersion;
    const url = new URL(window.location.href);
    url.searchParams.delete("note");
    url.searchParams.delete("contributor");
    window.history.replaceState({}, "", url);
    const restoreY = exploreReturnScrollY;
    exploreReturnScrollY = null;
    await loadPublicNotes();
    if (typeof restoreY === "number" && notesState.activeView === "explore") {
        window.requestAnimationFrame(() => window.scrollTo({top: restoreY, behavior: "instant"}));
    }
}

function renderActivePublicFilters(query, subject, collection, sort) {
    const container = document.getElementById("public-active-filters");
    const filters = [
        {name: "query", label: query ? `Search: ${query}` : ""},
        {name: "subject", label: subject ? `Subject: ${subject}` : ""},
        {name: "collection", label: collection ? `Topic: ${collection}` : ""},
        {name: "sort", label: sort !== "newest" ? `Sort: ${({relevance:"Best match", oldest:"Oldest", title:"Title A–Z", views:"Most viewed", helpful:"Most helpful", trending:"Trending"})[sort] || sort}` : ""}
    ].filter((filter) => filter.label);
    container.innerHTML = filters.length
        ? filters.map((filter) => `<button type="button" class="active-filter-chip active-filter-remove" data-clear-filter="${filter.name}" aria-label="Remove ${escapeHtml(filter.label)} filter">${escapeHtml(filter.label)} <span aria-hidden="true">×</span></button>`).join("")
        : '<span class="active-filter-empty">Showing all subjects and topics</span>';
    container.querySelectorAll("[data-clear-filter]").forEach((button) => {
        button.addEventListener("click", () => {
            const field = button.dataset.clearFilter;
            if (field === "query") document.getElementById("public-search").value = "";
            if (field === "subject") {
                document.getElementById("public-subject").value = "";
                refreshExploreTopicFilter();
            }
            if (field === "collection") document.getElementById("public-collection").value = "";
            if (field === "sort") document.getElementById("public-sort").value = "newest";
            notesState.publicPage = 1;
            loadPublicNotes();
        });
    });
}

async function loadPublicNotes() {
    document.getElementById("public-contributor-detail").hidden = true;
    const grid = document.getElementById("public-grid");
    const detail = document.getElementById("public-note-detail");
    const query = document.getElementById("public-search").value.trim();
    const subject = document.getElementById("public-subject").value;
    const collection = document.getElementById("public-collection").value;
    const sort = document.getElementById("public-sort").value;
    document.getElementById("explore-most-helpful").setAttribute("aria-pressed", String(sort === "helpful"));
    document.getElementById("explore-trending").setAttribute("aria-pressed", String(sort === "trending"));
    const explanation = document.getElementById("explore-ranking-explanation");
    const descriptions = {
        relevance: "Best match prioritizes note titles, then subjects, topics, contributor names, and descriptions.",
        trending: "Trending balances helpful votes, lifetime views, and publication recency. It does not track recent clicks or votes.",
        helpful: "Community favorites are ranked by helpful votes, with newer notes breaking ties."
    };
    explanation.textContent = descriptions[sort] || "";
    explanation.hidden = !descriptions[sort];
    const pageSize = Number(document.getElementById("public-page-size").value || notesState.publicPageSize || 18);
    notesState.publicPageSize = pageSize;
    const requestVersion = ++publicBrowseRequestVersion;

    detail.hidden = true;
    document.querySelector(".explore-controls")?.removeAttribute("hidden");
    grid.hidden = false;
    grid.innerHTML = "";
    setPublicStatus("Loading public notes...");

    try {
        const url = new URL(apiUrl("/api/public/notes"));
        if (query) url.searchParams.set("q", query);
        if (subject) url.searchParams.set("subject", subject);
        if (collection) url.searchParams.set("collection", collection);
        if (sort) url.searchParams.set("sort", sort);
        url.searchParams.set("page", String(notesState.publicPage));
        url.searchParams.set("pageSize", String(pageSize));

        const response = await fetch(url);
        const data = await response.json();
        if (requestVersion !== publicBrowseRequestVersion) return;
        if (!response.ok) throw new Error(data.error || "Unable to load public notes.");

        const notes = data.notes || [];
        applyPublicTaxonomy(data);
        const subjectSelect = document.getElementById("public-subject");
        const currentSubject = subjectSelect.value;
        const collectionSelect = document.getElementById("public-collection");
        const currentCollection = collectionSelect.value;

        if (subjectSelect.options.length <= 1 || currentSubject === "") {
            const options = ['<option value="">All subjects</option>']
                .concat(
                    (data.subjects || []).map(
                        (item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
                    )
                );
            subjectSelect.innerHTML = options.join("");
            subjectSelect.value = currentSubject;
        }

        refreshExploreTopicFilter();

        notesState.publicPage = data.page || 1;
        notesState.publicTotalPages = data.totalPages || 1;
        const pagination = document.getElementById("public-pagination");
        const pageLabel = document.getElementById("public-page-label");
        const total = Number(data.total || 0);
        const startItem = total ? ((notesState.publicPage - 1) * pageSize) + 1 : 0;
        const endItem = total ? Math.min(notesState.publicPage * pageSize, total) : 0;

        pagination.hidden = (data.totalPages || 1) <= 1;
        pageLabel.textContent = `Page ${notesState.publicPage} of ${notesState.publicTotalPages}`;
        document.getElementById("public-result-summary").textContent =
            total === 1 ? "1 public note" : `${total.toLocaleString()} public notes`;
        document.getElementById("public-page-summary").textContent =
            total ? `Showing ${startItem.toLocaleString()}–${endItem.toLocaleString()}` : "No matching notes";
        renderActivePublicFilters(query, subject, collection, sort);

        document.getElementById("public-first-page").disabled = notesState.publicPage <= 1;
        document.getElementById("public-prev-page").disabled = notesState.publicPage <= 1;
        document.getElementById("public-next-page").disabled = notesState.publicPage >= notesState.publicTotalPages;
        document.getElementById("public-last-page").disabled = notesState.publicPage >= notesState.publicTotalPages;

        document.getElementById("public-status").hidden = true;

        if (!notes.length) {
            const hasFilters = Boolean(query || subject || collection);
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>${hasFilters ? "No notes match these filters" : "No public notes yet"}</h3>
                    <p>${hasFilters ? "Try another subject, topic, or keyword." : "Published study materials will appear here as the library grows."}</p>
                    ${hasFilters ? '<button type="button" id="public-empty-reset" class="button button-secondary">Clear filters</button>' : ""}
                </div>
            `;
            grid.querySelector("#public-empty-reset")?.addEventListener("click", () => document.getElementById("public-search-clear").click());
            return;
        }

        notes.forEach((note) => {
            const card = document.createElement("article");
            card.className = "public-note-card";
            const subjectLabel = note.subject || "General";
            const collectionLabel = note.collection || "";
            const fileCount = Number(note.fileCount || 0);
            const viewCount = Number(note.viewCount || 0);
            const helpfulCount = Number(note.helpfulCount || 0);

            const seoUrl = publicNoteSeoUrl(note.noteId, note.title);

            card.innerHTML = `
                <div class="public-note-card-top">
                    ${note.subject ? `<button class="subject-chip public-taxonomy-link explore-subject-chip" data-explore-subject="${escapeHtml(subjectLabel)}" type="button" aria-label="Explore subject ${escapeHtml(subjectLabel)}">${escapeHtml(subjectLabel)}</button>` : `<span class="subject-chip">${escapeHtml(subjectLabel)}</span>`}
                    <span class="note-date">${escapeHtml(formatDate(note.publishedAt))}</span>
                </div>

                <div class="public-note-card-body">
                    <h3><a class="public-note-seo-link" href="${escapeHtml(seoUrl)}">${escapeHtml(note.title || "Untitled note")}</a></h3>
                    ${collectionLabel ? `<button type="button" class="public-note-collection explore-topic-link" data-explore-topic="${escapeHtml(collectionLabel)}" aria-label="Explore topic ${escapeHtml(collectionLabel)}">${escapeHtml(collectionLabel)}</button>` : ""}
                    <p class="public-note-description">${escapeHtml(note.description || "No description provided.")}</p>
                </div>

                <div class="public-note-card-footer">
                    <span>By ${note.contributorId ? `<a class="public-contributor-link" href="${escapeHtml(contributorShareUrl(note.contributorId))}" data-contributor-id="${escapeHtml(note.contributorId)}">${escapeHtml(note.publicAuthor || "Community member")}</a>` : escapeHtml(note.publicAuthor || "Community member")}</span>
                    <div class="public-note-stats">
                        <span>${fileCount} file${fileCount === 1 ? "" : "s"}</span>
                        <span>${viewCount.toLocaleString()} view${viewCount === 1 ? "" : "s"}</span>
                        <span class="helpful-count" aria-label="${helpfulCount} helpful votes">♡ ${helpfulCount.toLocaleString()}</span>
                    </div>
                </div>
            `;

            const openCard = () => {
                rememberExplorePosition();
                openPublicNote(note.noteId);
            };
            card.querySelector(".public-note-seo-link")?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openCard();
            });
            card.querySelector("[data-explore-subject]")?.addEventListener("click", (event) => {
                event.stopPropagation();
                browsePublicTaxonomy(note.subject);
            });
            card.querySelector("[data-explore-topic]")?.addEventListener("click", (event) => {
                event.stopPropagation();
                browsePublicTaxonomy(note.subject, note.collection);
            });
            card.querySelector("[data-contributor-id]")?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                rememberExplorePosition();
                openPublicContributor(note.contributorId);
            });
            card.addEventListener("click", (event) => {
                if (!event.target.closest("a, button")) openCard();
            });

            grid.appendChild(card);
        });
    } catch (error) {
        if (requestVersion !== publicBrowseRequestVersion) return;
        console.error("Unable to load public notes:", error);
        document.getElementById("public-pagination").hidden = true;
        setPublicStatus("Unable to load public notes. Please try again.", true);
        grid.innerHTML = `
            <div class="empty-state">
                <h3>Explore is temporarily unavailable</h3>
                <p>Check your connection and try loading the public notes again.</p>
                <button class="button button-secondary" id="public-retry" type="button">Try again</button>
            </div>
        `;
        grid.querySelector("#public-retry")?.addEventListener("click", loadPublicNotes);
    }
}

function publicNoteSlug(title) {
    return String(title || "study-note")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "study-note";
}

function contributorShareUrl(contributorId) {
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("contributor", contributorId);
    return url.toString();
}

async function openPublicContributor(contributorId, updateUrl = true, requestedPage = 1) {
    if (!/^[0-9a-f]{64}$/.test(String(contributorId || ""))) return;
    exitPublicReaderFocus();
    activePublicReader = null;
    ++sourceRenderVersion;
    const version = ++publicBrowseRequestVersion;
    const panel = document.getElementById("public-contributor-detail");
    const content = document.getElementById("public-contributor-content");
    const noteDetail = document.getElementById("public-note-detail");
    const grid = document.getElementById("public-grid");

    noteDetail.hidden = true;
    document.querySelector(".explore-controls")?.setAttribute("hidden", "");
    document.getElementById("public-pagination").hidden = true;
    document.getElementById("public-status").hidden = true;
    grid.hidden = true;
    panel.hidden = false;
    content.innerHTML = '<div class="status-card" role="status">Loading contributor profile...</div>';

    try {
        const url = new URL(apiUrl(`/api/public/contributors/${encodeURIComponent(contributorId)}`));
        url.searchParams.set("page", String(requestedPage));
        const response = await fetch(url);
        const data = await response.json();
        if (version !== publicBrowseRequestVersion) return;
        if (!response.ok) throw new Error(data.error || "Unable to load contributor.");

        const contributor = data.contributor;
        const noteList = data.notes || [];
        content.innerHTML = `
            <header class="contributor-profile-hero">
                <div class="contributor-avatar avatar-${["indigo","emerald","rose","amber","slate","ocean"].includes(contributor.avatarStyle) ? contributor.avatarStyle : "indigo"}" aria-hidden="true">${escapeHtml((contributor.displayName || "C").slice(0, 1).toUpperCase())}</div>
                <div class="contributor-profile-main">
                    <p class="eyebrow">Community contributor</p>
                    <h2>${escapeHtml(contributor.displayName || "Community member")}</h2>
                    <p class="contributor-bio">${escapeHtml(contributor.bio || "Sharing notes with the StudyGrounds community.")}</p>
                    <p>${Number(contributor.contributionCount || 0).toLocaleString()} published ${Number(contributor.contributionCount || 0) === 1 ? "note" : "notes"} · ♡ ${Number(contributor.helpfulCount || 0).toLocaleString()} helpful votes · ${(contributor.subjects || []).length} subjects</p>
                </div>
                <button type="button" class="button button-secondary" id="share-contributor-profile">Copy Profile Link</button>
            </header>
            <section class="contributor-taxonomy" aria-label="Contributor subjects and topics">
                <div>
                    <h3>Subjects</h3>
                    <div class="contributor-chips">${(contributor.subjects || []).length ? contributor.subjects.map((item) => `<button type="button" class="subject-chip public-taxonomy-link" data-profile-subject="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("") : '<span class="status-text">No subjects yet</span>'}</div>
                </div>
                <div>
                    <h3>Topics</h3>
                    <div class="contributor-chips">${(contributor.topics || []).length ? contributor.topics.map((item) => `<span class="related-public-topic">${escapeHtml(item)}</span>`).join("") : '<span class="status-text">No topics yet</span>'}</div>
                </div>
            </section>
            <section class="contributor-notes-section">
                <h3>Published notes</h3>
                <div class="contributor-notes-grid">
                    ${noteList.map((note) => `
                        <article class="related-public-card">
                            <div class="related-public-meta"><span class="subject-chip">${escapeHtml(note.subject || "General")}</span>${note.collection ? `<span class="related-public-topic">${escapeHtml(note.collection)}</span>` : ""}</div>
                            <h4><a href="${escapeHtml(publicNoteSeoUrl(note.noteId, note.title))}" data-profile-note-id="${escapeHtml(note.noteId)}">${escapeHtml(note.title || "Untitled note")}</a></h4>
                            <p class="related-public-description">${escapeHtml(note.description || "No description provided.")}</p>
                            <span class="related-public-author">${escapeHtml(formatDate(note.publishedAt))} · ♡ ${Number(note.helpfulCount || 0).toLocaleString()} helpful</span>
                        </article>
                    `).join("")}
                </div>
                ${data.totalPages > 1 ? `<nav class="contributor-pagination" aria-label="Contributor notes pages"><button type="button" class="button button-secondary" id="contributor-prev" ${data.page <= 1 ? "disabled" : ""}>Previous</button><span>Page ${data.page} of ${data.totalPages}</span><button type="button" class="button button-secondary" id="contributor-next" ${data.page >= data.totalPages ? "disabled" : ""}>Next</button></nav>` : ""}
            </section>
        `;
        if (updateUrl) {
            const share = new URL(contributorShareUrl(contributorId));
            window.history.replaceState({}, "", share);
        }
        content.querySelector("#share-contributor-profile")?.addEventListener("click", async (event) => {
            const share = contributorShareUrl(contributorId);
            try {
                await navigator.clipboard.writeText(share);
                showCopyToast(event);
            } catch (error) {
                window.prompt("Copy profile link:", share);
            }
        });
        content.querySelectorAll("[data-profile-note-id]").forEach((link) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                openPublicNote(link.dataset.profileNoteId);
            });
        });
        content.querySelectorAll("[data-profile-subject]").forEach((button) => {
            button.addEventListener("click", () => browsePublicTaxonomy(button.dataset.profileSubject));
        });
        content.querySelector("#contributor-prev")?.addEventListener("click", () => openPublicContributor(contributorId, false, data.page - 1));
        content.querySelector("#contributor-next")?.addEventListener("click", () => openPublicContributor(contributorId, false, data.page + 1));
    } catch (error) {
        if (version !== publicBrowseRequestVersion) return;
        content.innerHTML = `<div class="empty-state"><h3>Contributor unavailable</h3><p>${escapeHtml(error.message || "Unable to load this contributor.")}</p><button type="button" class="button button-secondary" id="retry-contributor-profile">Try again</button></div>`;
        content.querySelector("#retry-contributor-profile")?.addEventListener("click", () => openPublicContributor(contributorId, updateUrl, requestedPage));
    }
}

function publicNoteSeoUrl(noteId, title) {
    return `${window.location.origin}/notes/${encodeURIComponent(noteId)}/${publicNoteSlug(title)}`;
}

function publicNoteShareUrl(noteId, title) {
    return publicNoteSeoUrl(noteId, title);
}

async function sharePublicNote(noteId, title, event = null) {
    const url = publicNoteShareUrl(noteId, title);
    try {
        await navigator.clipboard.writeText(url);
        showCopyToast(event);
    } catch {
        window.prompt("Copy this note link:", url);
    }
}


async function getPublicNoteReportStatus(noteId) {
    try {
        const response = await authenticatedFetch(
            `/api/public/notes/${encodeURIComponent(noteId)}/report`
        );
        const data = await response.json();
        if (!response.ok) return {reported: false, report: null};
        return {
            reported: Boolean(data.reported),
            report: data.report || null
        };
    } catch {
        return {reported: false, report: null};
    }
}

function closeReportNoteModal() {
    const modal = document.getElementById("report-note-modal");
    if (modal) modal.hidden = true;
}

function openReportNoteModal() {
    const modal = document.getElementById("report-note-modal");
    if (modal) {
        modal.hidden = false;
        document.getElementById("report-note-reason")?.focus();
    }
}

async function submitPublicNoteReport(noteId) {
    const reasonElement = document.getElementById("report-note-reason");
    const detailsElement = document.getElementById("report-note-details");
    const statusElement = document.getElementById("report-note-status");
    const submitButton = document.getElementById("report-note-submit");

    const reason = reasonElement?.value || "";
    const details = detailsElement?.value?.trim() || "";

    if (!reason) {
        if (statusElement) {
            statusElement.textContent = "Choose a reason before submitting.";
            statusElement.className = "status-text error";
        }
        return;
    }

    if (submitButton) submitButton.disabled = true;
    if (statusElement) {
        statusElement.textContent = "Submitting report...";
        statusElement.className = "status-text";
    }

    try {
        const response = await authenticatedFetch(
            `/api/public/notes/${encodeURIComponent(noteId)}/report`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({reason, details})
            }
        );
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409 && data.reported) {
                const trigger = document.getElementById("report-note-trigger");
                if (trigger) {
                    trigger.textContent = "Already reported";
                    trigger.disabled = true;
                }
                closeReportNoteModal();
                showAppNotice("You already reported this note.", "info");
                return;
            }
            throw new Error(data.error || "Unable to submit report.");
        }

        const trigger = document.getElementById("report-note-trigger");
        if (trigger) {
            trigger.textContent = "Already reported";
            trigger.disabled = true;
        }
        if (detailsElement) detailsElement.value = "";
        closeReportNoteModal();
        showAppNotice(data.message || "Report submitted.", "success", 5200);
    } catch (error) {
        if (statusElement) {
            statusElement.textContent = error.message || "Unable to submit report.";
            statusElement.className = "status-text error";
        }
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

function moderationReasonLabel(reason) {
    const labels = {
        spam: "Spam",
        inappropriate: "Inappropriate content",
        copyright: "Copyright concern",
        misleading: "Misleading or inaccurate",
        other: "Other"
    };
    return labels[String(reason || "").toLowerCase()] || reason || "Unspecified";
}

function renderModerationReports(reports) {
    const container = document.getElementById("moderation-reports");
    if (!container) return;

    if (!reports.length) {
        container.innerHTML = '<div class="empty-state"><h3>No reports yet</h3><p>Community reports will appear here for review.</p></div>';
        return;
    }

    container.innerHTML = reports.map((report) => {
        const status = String(report.status || "OPEN").toUpperCase();
        const isOpen = status === "OPEN";
        const canRestore = status === "ACTIONED" && String(report.adminAction || "").toLowerCase() === "unpublish";
        return `
            <article class="security-history-item moderation-report-item">
                <div class="security-history-heading">
                    <div>
                        <strong>${escapeHtml(report.noteTitle || "Untitled note")}</strong>
                        <span class="status-pill">${escapeHtml(status)}</span>
                    </div>
                    <span>${escapeHtml(formatDate(report.createdAt))}</span>
                </div>
                <p><strong>Reason:</strong> ${escapeHtml(moderationReasonLabel(report.reason))}</p>
                ${report.details ? `<p>${escapeHtml(report.details)}</p>` : ""}
                <p class="note-description">
                    Reporter: ${escapeHtml(report.reporterEmail || "Signed-in member")}
                    ${report.reviewedBy ? ` · Reviewed by ${escapeHtml(report.reviewedBy)}` : ""}
                </p>
                ${isOpen ? `
                    <div class="security-detail-actions">
                        <button class="button button-secondary moderation-action" type="button"
                            data-report-id="${escapeHtml(report.reportId)}" data-action="dismiss">
                            Dismiss
                        </button>
                        <button class="button security-danger-button moderation-action" type="button"
                            data-report-id="${escapeHtml(report.reportId)}" data-action="unpublish">
                            Unpublish note
                        </button>
                    </div>
                ` : canRestore ? `
                    <div class="security-detail-actions">
                        <span class="note-description">This note is currently held from publishing.</span>
                        <button class="button button-secondary moderation-action" type="button"
                            data-report-id="${escapeHtml(report.reportId)}" data-action="restore">
                            Restore note
                        </button>
                    </div>
                ` : ""}
            </article>
        `;
    }).join("");

    container.querySelectorAll(".moderation-action").forEach((button) => {
        button.addEventListener("click", () => {
            applyModerationAction(button.dataset.reportId, button.dataset.action);
        });
    });
}

async function loadAdminModeration() {
    if (!isConfiguredAdmin()) return;

    const status = document.getElementById("moderation-status");
    const content = document.getElementById("moderation-content");
    if (status) {
        status.hidden = false;
        status.textContent = "Loading reports...";
        status.className = "status-card";
    }
    if (content) content.hidden = true;

    try {
        const response = await adminFetch("/api/admin/moderation");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load moderation reports.");

        const metrics = data.metrics || {};
        document.getElementById("moderation-metric-open").textContent = Number(metrics.open || 0).toLocaleString();
        document.getElementById("moderation-metric-actioned").textContent = Number(metrics.actioned || 0).toLocaleString();
        document.getElementById("moderation-metric-dismissed").textContent = Number(metrics.dismissed || 0).toLocaleString();
        document.getElementById("moderation-metric-total").textContent = Number(metrics.total || 0).toLocaleString();
        renderModerationReports(data.reports || []);

        if (status) status.hidden = true;
        if (content) content.hidden = false;
    } catch (error) {
        if (status) {
            status.hidden = false;
            status.textContent = error.message || "Unable to load moderation reports.";
            status.className = "status-card error";
        }
    }
}

async function applyModerationAction(reportId, action) {
    if (!reportId || !action) return;

    const actionLabel = action === "unpublish"
        ? "unpublish this note"
        : action === "restore"
            ? "restore this note to the owner as private"
            : "dismiss this report";
    if (!window.confirm(`Are you sure you want to ${actionLabel}?`)) return;

    try {
        const response = await adminFetch(
            `/api/admin/moderation/${encodeURIComponent(reportId)}`,
            {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({action})
            }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to apply moderation action.");

        showAppNotice(
            action === "unpublish"
                ? "The reported note was unpublished and placed on moderation hold."
                : action === "restore"
                    ? "The moderation hold was removed. The note remains private until the owner republishes it."
                    : "The report was dismissed.",
            "success"
        );
        await loadAdminModeration();
    } catch (error) {
        showAppNotice(error.message || "Unable to apply moderation action.", "error", 6500);
    }
}

let publicBrowseRequestVersion = 0;

// Navigate from a note into the existing subject/topic filters without extra endpoints.
function browsePublicTaxonomy(subject, topic = "") {
    exitPublicReaderFocus();
    activePublicReader = null;
    ++sourceRenderVersion;
    const subjectSelect = document.getElementById("public-subject");
    const topicSelect = document.getElementById("public-collection");
    if (!subjectSelect || !topicSelect) return;

    const selectedSubject = String(subject || "").trim();
    const selectedTopic = String(topic || "").trim();
    const ensureOption = (select, value) => {
        if (value && !Array.from(select.options).some((option) => option.value === value)) {
            select.add(new Option(value, value));
        }
        select.value = value;
    };

    document.getElementById("public-search").value = "";
    ensureOption(subjectSelect, selectedSubject);
    refreshExploreTopicFilter();
    ensureOption(topicSelect, selectedTopic);
    notesState.publicPage = 1;

    exploreReturnScrollY = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("note");
    url.searchParams.delete("contributor");
    window.history.replaceState({}, "", url);
    setActiveView("explore");
}

// Recommendations use the existing public listing endpoint, which only exposes safe published notes.
// This is a lightweight discovery enhancement, not a personalized ranking engine.
async function loadRelatedPublicNotes(note) {
    const container = document.getElementById("related-public-notes");
    if (!container || !note.subject) return;

    const currentNoteId = note.noteId;
    const currentTopic = (note.collection || "").trim().toLowerCase();
    const url = new URL(apiUrl("/api/public/notes"));
    url.searchParams.set("subject", note.subject);
    url.searchParams.set("pageSize", "48");
    url.searchParams.set("sort", "newest");

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not load related notes");
        const data = await response.json();

        // Ignore late responses after navigating to another note.
        if (!container.isConnected || container.dataset.noteId !== currentNoteId) return;

        const candidates = (data.notes || [])
            .filter((candidate) => candidate.noteId && candidate.noteId !== currentNoteId)
            .sort((a, b) => {
                const aMatch = currentTopic && (a.collection || "").trim().toLowerCase() === currentTopic ? 1 : 0;
                const bMatch = currentTopic && (b.collection || "").trim().toLowerCase() === currentTopic ? 1 : 0;
                return bMatch - aMatch;
            })
            .slice(0, 4);

        if (!candidates.length) {
            container.hidden = true;
            return;
        }

        container.innerHTML = `
            <div class="related-public-heading">
                <div>
                    <p class="eyebrow">Keep studying</p>
                    <h3>Related notes</h3>
                    <p class="related-public-subtitle">More from ${escapeHtml(note.subject)}${note.collection ? ` · ${escapeHtml(note.collection)}` : ""}</p>
                </div>
                <button type="button" class="related-browse-link" id="browse-related-subject">Browse ${escapeHtml(note.subject)} <span aria-hidden="true">→</span></button>
            </div>
            <div class="related-public-grid">
                ${candidates.map((candidate) => `
                    <article class="related-public-card">
                        <div class="related-public-meta">
                            <span class="subject-chip">${escapeHtml(candidate.subject || "General")}</span>
                            ${candidate.collection ? `<span class="related-public-topic">${escapeHtml(candidate.collection)}</span>` : ""}
                        </div>
                        <h4><a href="${escapeHtml(publicNoteSeoUrl(candidate.noteId, candidate.title))}" data-related-id="${escapeHtml(candidate.noteId)}">${escapeHtml(candidate.title || "Untitled note")} <span aria-hidden="true">↗</span></a></h4>
                        <p class="related-public-description">${escapeHtml(candidate.description || "No description provided.")}</p>
                        <span class="related-public-author">♡ ${Number(candidate.helpfulCount || 0).toLocaleString()} helpful · By ${candidate.contributorId ? `<a class="public-contributor-link" href="${escapeHtml(contributorShareUrl(candidate.contributorId))}" data-related-contributor="${escapeHtml(candidate.contributorId)}">${escapeHtml(candidate.publicAuthor || "Community member")}</a>` : escapeHtml(candidate.publicAuthor || "Community member")}</span>
                    </article>
                `).join("")}
            </div>
        `;
        container.hidden = false;
        container.querySelector("#browse-related-subject")?.addEventListener("click", () => browsePublicTaxonomy(note.subject));
        container.querySelectorAll("[data-related-contributor]").forEach((link) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                openPublicContributor(link.dataset.relatedContributor);
            });
        });
        container.querySelectorAll("[data-related-id]").forEach((link) => {
            link.addEventListener("click", (event) => {
                event.preventDefault();
                openPublicNote(link.dataset.relatedId);
            });
        });
    } catch (error) {
        // Discovery is optional: failed requests must not prevent viewing the source note.
        if (container.isConnected && container.dataset.noteId === currentNoteId) {
            container.hidden = true;
        }
        console.warn("Related notes unavailable:", error);
    }
}

// Helpful votes are per account; never infer a vote from public counts.
async function initializeHelpfulButton(note) {
    const button = document.getElementById("helpful-public-note");
    const status = document.getElementById("helpful-public-feedback");
    const count = document.getElementById("public-helpful-count");
    if (!button || !status || !count) return;

    let voted = false;
    let currentCount = Math.max(0, Number(note.helpfulCount || 0));
    const draw = () => {
        count.textContent = currentCount.toLocaleString() + (currentCount === 1 ? " helpful vote" : " helpful votes");
        button.textContent = voted ? "♥ Marked helpful" : "♡ Helpful";
        button.setAttribute("aria-pressed", String(voted));
    };
    draw();
    if (!isAuthenticated()) {
        button.textContent = "Sign in to vote";
        button.setAttribute("aria-pressed", "false");
        button.addEventListener("click", signIn);
        return;
    }

    // Owner cannot vote on their own material.
    const ownNote = notesState.notes.some((item) => item.noteId === note.noteId);
    if (ownNote) {
        button.disabled = true;
        button.textContent = "Your note";
        status.textContent = "Authors cannot vote on their own notes.";
        return;
    }
    button.disabled = true;
    status.textContent = "Checking vote...";
    try {
        const response = await authenticatedFetch(`/api/public/notes/${encodeURIComponent(note.noteId)}/helpful`);
        const data = await response.json();
        if (!button.isConnected || button.dataset.noteId !== note.noteId) return;
        if (!response.ok) throw new Error(data.error || "Unable to check helpful vote.");
        voted = Boolean(data.helpful);
        currentCount = Math.max(0, Number(data.helpfulCount || 0));
        status.textContent = "";
    } catch (error) {
        if (!button.isConnected) return;
        button.disabled = false;
        button.textContent = "Retry helpful status";
        status.textContent = "Couldn't check vote status.";
        button.addEventListener("click", () => initializeHelpfulButton(note), {once: true});
        return;
    }
    button.disabled = false;
    draw();
    button.addEventListener("click", async () => {
        button.disabled = true;
        status.textContent = "Updating...";
        try {
            const response = await authenticatedFetch(
                `/api/public/notes/${encodeURIComponent(note.noteId)}/helpful`,
                {method: voted ? "DELETE" : "PUT"}
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to update helpful vote.");
            if (!button.isConnected || button.dataset.noteId !== note.noteId) return;
            voted = Boolean(data.helpful);
            currentCount = Math.max(0, Number(data.helpfulCount || 0));
            status.textContent = voted ? "Thanks for your feedback!" : "Vote removed.";
            draw();
        } catch (error) {
            if (button.isConnected) status.textContent = error.message || "Unable to update vote.";
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    });
}

// Saved Notes contains references only; note content always comes from the live public API.
async function loadSavedNotes(append = false) {
    if (!isAuthenticated()) return;
    const version = ++notesState.savedLoadVersion;
    const grid = document.getElementById("saved-notes-grid");
    const status = document.getElementById("saved-notes-status");
    const more = document.getElementById("saved-notes-more");
    const requestToken = getAccessToken();
    if (!append) {
        notesState.savedCursor = null;
        grid.replaceChildren();
        status.hidden = false;
        status.textContent = "Loading saved notes...";
    }
    more.disabled = true;
    more.hidden = true;
    try {
        const url = new URL(apiUrl("/api/saved-notes"));
        if (append && notesState.savedCursor) url.searchParams.set("cursor", notesState.savedCursor);
        const response = await authenticatedFetch(url.pathname + url.search);
        const data = await response.json();
        if (version !== notesState.savedLoadVersion || requestToken !== getAccessToken()) return;
        if (!response.ok) throw new Error(data.error || "Unable to load saved notes.");

        for (const note of (data.notes || [])) {
            const card = document.createElement("article");
            card.className = "saved-note-card";
            if (note.available) {
                card.innerHTML = `
                    <div class="saved-note-card-top"><span class="subject-chip">${escapeHtml(note.subject || "General")}</span><span class="saved-note-date">Saved ${escapeHtml(formatDate(note.savedAt))}</span></div>
                    <h3><a href="${escapeHtml(publicNoteSeoUrl(note.noteId, note.title))}" class="saved-note-open">${escapeHtml(note.title || "Untitled note")}</a></h3>
                    ${note.collection ? `<p class="public-note-collection">${escapeHtml(note.collection)}</p>` : ""}
                    <p class="saved-note-description">${escapeHtml(note.description || "No description provided.")}</p>
                    <div class="saved-note-footer"><span>By ${escapeHtml(note.publicAuthor || "Community member")} · ♡ ${Number(note.helpfulCount || 0).toLocaleString()} helpful</span><button type="button" class="button button-text saved-note-remove">Remove</button></div>
                `;
                card.querySelector(".saved-note-open").addEventListener("click", (event) => {
                    event.preventDefault();
                    setActiveView("explore");
                    openPublicNote(note.noteId);
                });
            } else {
                card.classList.add("saved-note-unavailable");
                card.innerHTML = `
                    <h3>Saved note unavailable</h3>
                    <p>This note is no longer public. Its contents are not accessible.</p>
                    <div class="saved-note-footer"><span>Your bookmark is retained</span><button type="button" class="button button-text saved-note-remove">Remove</button></div>
                `;
            }
            card.querySelector(".saved-note-remove").addEventListener("click", () => removeSavedCard(note.noteId, card));
            grid.appendChild(card);
        }
        notesState.savedCursor = data.nextCursor || null;
        more.hidden = !notesState.savedCursor;
        more.disabled = false;
        status.hidden = true;
        if (!grid.children.length) {
            grid.innerHTML = '<div class="empty-state"><h3>Nothing saved yet</h3><p>Explore public notes and choose Save Note to build your study library.</p><button type="button" class="button button-secondary" id="saved-explore">Explore notes</button></div>';
            grid.querySelector("#saved-explore").addEventListener("click", () => setActiveView("explore"));
        }
    } catch (error) {
        if (version !== notesState.savedLoadVersion || requestToken !== getAccessToken()) return;
        status.hidden = false;
        status.textContent = error.message || "Unable to load saved notes.";
        more.hidden = !notesState.savedCursor;
        more.disabled = false;
        if (!grid.children.length) {
            grid.innerHTML = '<div class="empty-state"><h3>Saved Notes is unavailable</h3><p>Please retry loading your library.</p><button class="button button-secondary" id="saved-retry" type="button">Try again</button></div>';
            grid.querySelector("#saved-retry").addEventListener("click", () => loadSavedNotes());
        }
    }
}

async function removeSavedCard(noteId, card) {
    const button = card.querySelector(".saved-note-remove");
    button.disabled = true;
    try {
        const response = await authenticatedFetch(`/api/saved-notes/${encodeURIComponent(noteId)}`, {method: "DELETE"});
        if (!response.ok) throw new Error("Unable to remove saved note.");
        card.remove();
        showAppNotice("Removed from Saved Notes.", "success");
        // Avoid immediately reloading an eventually consistent index after deletion.
        const grid = document.getElementById("saved-notes-grid");
        if (notesState.activeView === "saved-notes" && !grid.children.length && !notesState.savedCursor) {
            grid.innerHTML = '<div class="empty-state"><h3>Nothing saved yet</h3><p>Explore public notes and choose Save Note to build your study library.</p><button type="button" class="button button-secondary" id="saved-explore">Explore notes</button></div>';
            grid.querySelector("#saved-explore").addEventListener("click", () => setActiveView("explore"));
        }
    } catch (error) {
        button.disabled = false;
        showAppNotice(error.message || "Unable to remove saved note.", "error");
    }
}

async function initializeSaveButton(noteId) {
    const button = document.getElementById("save-public-note");
    const feedback = document.getElementById("save-public-feedback");
    if (!button) return;
    if (!isAuthenticated()) {
        button.textContent = "Sign in to save";
        button.addEventListener("click", signIn);
        return;
    }
    button.disabled = true;
    button.textContent = "Checking saved status...";
    let saved = false;
    let automaticallySaved = false;
    // Annotation creation and bookmarking happen atomically in the backend.
    // Keep this existing button's state in sync without attaching extra click handlers.
    button.addEventListener("study:auto-saved", () => {
        automaticallySaved = true;
        saved = true;
        button.textContent = "✓ Saved — remove";
        button.setAttribute("aria-pressed", "true");
        feedback.textContent = "In your Saved Notes library";
    });
    try {
        const response = await authenticatedFetch(`/api/saved-notes/${encodeURIComponent(noteId)}`);
        const data = await response.json();
        if (!button.isConnected || button.dataset.noteId !== noteId) return;
        if (!response.ok) throw new Error(data.error || "Unable to check saved note.");
        saved = automaticallySaved || Boolean(data.saved);
    } catch (error) {
        if (!button.isConnected) return;
        if (!automaticallySaved) {
            button.textContent = "Try saved status again";
            button.disabled = false;
            feedback.textContent = "Saved status unavailable. Please retry.";
            button.addEventListener("click", () => initializeSaveButton(noteId), {once: true});
            return;
        }
        saved = true;
    }
    button.disabled = false;
    const draw = () => {
        button.textContent = saved ? "✓ Saved — remove" : "☆ Save Note";
        button.setAttribute("aria-pressed", String(saved));
        feedback.textContent = saved ? "In your Saved Notes library" : "";
    };
    draw();
    button.addEventListener("click", async () => {
        button.disabled = true;
        try {
            const response = await authenticatedFetch(`/api/saved-notes/${encodeURIComponent(noteId)}`, {method: saved ? "DELETE" : "PUT"});
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Unable to update saved note.");
            if (!button.isConnected || button.dataset.noteId !== noteId) return;
            saved = Boolean(data.saved);
            draw();
            showAppNotice(saved ? "Added to Saved Notes." : "Removed from Saved Notes.", "success");
        } catch (error) {
            if (button.isConnected) {
                feedback.textContent = error.message || "Unable to save note.";
            }
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    });
}

// Reading preferences are local to the current browser, never shared with note authors.
const READER_PREFERENCES_KEY = "studygrounds.reader.preferences.v1";
function getReaderPreferences() {
    try {
        const stored = JSON.parse(window.localStorage.getItem(READER_PREFERENCES_KEY) || "{}");
        return {
            size: ["normal", "large", "extra"].includes(stored.size) ? stored.size : "normal",
            width: stored.width === "comfortable" ? "comfortable" : "wide"
        };
    } catch {
        return {size: "normal", width: "wide"};
    }
}
function applyReaderPreferences() {
    const prefs = getReaderPreferences();
    const panel = document.getElementById("public-note-detail");
    panel.dataset.readerSize = prefs.size;
    panel.dataset.readerWidth = prefs.width;
    const size = document.getElementById("reader-text-size");
    const width = document.getElementById("reader-width");
    if (size) size.value = prefs.size;
    if (width) width.value = prefs.width;
}
function updateReaderPreference(name, value) {
    const prefs = getReaderPreferences();
    prefs[name] = value;
    try { window.localStorage.setItem(READER_PREFERENCES_KEY, JSON.stringify(prefs)); } catch {}
    applyReaderPreferences();
}
function exitPublicReaderFocus() {
    document.body.classList.remove("public-reader-focus");
    const button = document.getElementById("reader-focus-toggle");
    if (button) {
        button.textContent = "Focus mode";
        button.setAttribute("aria-pressed", "false");
    }
}
function togglePublicReaderFocus() {
    const enabled = document.body.classList.toggle("public-reader-focus");
    const button = document.getElementById("reader-focus-toggle");
    if (button) {
        button.textContent = enabled ? "Exit focus" : "Focus mode";
        button.setAttribute("aria-pressed", String(enabled));
    }
    if (enabled) document.getElementById("reader-source-toolbar")?.scrollIntoView({block: "start"});
    else button?.focus({preventScroll: true});
}
function setupPublicReaderControls() {
    applyReaderPreferences();
    document.getElementById("reader-focus-toggle")?.addEventListener("click", togglePublicReaderFocus);
    document.getElementById("reader-text-size")?.addEventListener("change", (event) => {
        updateReaderPreference("size", event.target.value);
    });
    document.getElementById("reader-width")?.addEventListener("change", (event) => {
        updateReaderPreference("width", event.target.value);
    });
}
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("public-reader-focus")) {
        exitPublicReaderFocus();
        document.getElementById("reader-focus-toggle")?.focus({preventScroll: true});
    }
});

// Study activity is account-private. The backend verifies current public visibility
// and returns no old note titles or files if a source has been removed.
function friendlyStudyDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});
}

async function fetchStudyDashboard() {
    const response = await authenticatedFetch("/api/study");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to load study history.");
    return data;
}

async function loadStudyDashboard() {
    if (!isAuthenticated()) return;
    const version = ++notesState.studyLoadVersion;
    const token = getAccessToken();
    const status = document.getElementById("study-history-status");
    status.hidden = false;
    status.textContent = "Loading study history...";
    try {
        const data = await fetchStudyDashboard();
        if (version !== notesState.studyLoadVersion || token !== getAccessToken()) return;
        notesState.studyDashboard = data;
        notesState.studyActiveSession = (data.sessions || []).find(item => item.status === "active") || null;
        renderStudyDashboard(data);
        status.hidden = true;
    } catch (error) {
        if (version !== notesState.studyLoadVersion || token !== getAccessToken()) return;
        status.hidden = false;
        status.textContent = error.message || "Unable to load study history.";
    }
}

function renderStudyDashboard(data) {
    const progressContainer = document.getElementById("study-continue-list");
    const sessionsContainer = document.getElementById("study-sessions-list");
    if (!progressContainer || !sessionsContainer) return;
    progressContainer.replaceChildren();
    sessionsContainer.replaceChildren();

    const recent = (data.continueStudying || []);
    const sessions = (data.sessions || []);
    const openNote = async (note) => {
        await setActiveView("explore");
        if (notesState.activeView === "explore") openPublicNote(note.noteId, true, note.fileId || null);
    };
    for (const note of recent) {
        const card = document.createElement("article");
        card.className = "study-history-card";
        card.innerHTML = note.available
            ? `<div><h4>${escapeHtml(note.title || "Untitled note")}</h4><p>${escapeHtml(note.subject || "Study material")} · Last opened ${escapeHtml(friendlyStudyDate(note.lastOpenedAt))}</p></div><button type="button" class="button button-secondary">Continue studying</button>`
            : '<div><h4>Note unavailable</h4><p>This study source is no longer public.</p></div>';
        if (note.available) card.querySelector("button").addEventListener("click", () => openNote(note));
        progressContainer.appendChild(card);
    }
    if (!recent.length) progressContainer.innerHTML = '<p class="status-text">Open a public note to begin your study history.</p>';

    for (const session of sessions) {
        const card = document.createElement("article");
        card.className = "study-history-card";
        const active = session.status === "active";
        card.innerHTML = `
            <div>
                <h4>${escapeHtml(session.available ? session.title : "Note unavailable")}</h4>
                <p>${escapeHtml(friendlyStudyDate(session.startedAt))} · ${active ? "In progress" : `${Number(session.minutes || 0)} minute${Number(session.minutes || 0) === 1 ? "" : "s"} studied`}</p>
            </div>
            ${active ? '<button type="button" class="button button-secondary" data-finish-study>Finish session</button>' : ""}
        `;
        if (active) card.querySelector("[data-finish-study]").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await finishStudySession(session);
                loadStudyDashboard();
            } catch (error) {
                button.disabled = false;
                showAppNotice(error.message, "error");
            }
        });
        sessionsContainer.appendChild(card);
    }
    if (!sessions.length) sessionsContainer.innerHTML = '<p class="status-text">Completed sessions will appear here after you finish studying.</p>';
}

let studyPositionSaveQueue = Promise.resolve();
function saveStudySource(noteId, fileId) {
    if (!isAuthenticated() || !fileId) return;
    const accountToken = getAccessToken();
    // Serialize quick source switches so an older request cannot win the race.
    studyPositionSaveQueue = studyPositionSaveQueue.catch(() => {}).then(async () => {
        if (!isAuthenticated() || getAccessToken() !== accountToken) return;
        try {
            const response = await authenticatedFetch(`/api/study/progress/${encodeURIComponent(noteId)}`, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({fileId})
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Unable to remember source.");
            }
        } catch (error) {
            console.warn("Couldn't save study position:", error);
        }
    });
}

function renderStudySessionControls(noteId) {
    const start = document.getElementById("start-study-session");
    const finish = document.getElementById("finish-study-session");
    const status = document.getElementById("study-session-status");
    if (!start || !finish || !status) return;
    const active = notesState.studyActiveSession;
    const isCurrent = active && active.noteId === noteId;
    start.hidden = Boolean(active);
    finish.hidden = !isCurrent;
    status.textContent = isCurrent ? `Started ${friendlyStudyDate(active.startedAt)}`
        : active ? "Finish your existing session in Study History before starting another." : "Study time is recorded only when you start a session.";
}

async function startStudySession(noteId) {
    const button = document.getElementById("start-study-session");
    if (button) button.disabled = true;
    try {
        if (notesState.studyActiveSession) throw new Error("Finish your previous session before starting another.");
        const response = await authenticatedFetch("/api/study/sessions", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({noteId})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to start session.");
        notesState.studyActiveSession = data.session;
        renderStudySessionControls(noteId);
        showAppNotice("Study session started.", "success");
    } catch (error) {
        showAppNotice(error.message, "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function finishStudySession(session) {
    const response = await authenticatedFetch(`/api/study/sessions/${encodeURIComponent(session.sessionId)}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({startedAt: session.startedAt})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to finish session.");
    if (notesState.studyActiveSession?.sessionId === session.sessionId) notesState.studyActiveSession = null;
    renderStudySessionControls(session.noteId);
    showAppNotice(`Study session finished · ${Number(data.session?.minutes || 0)} minutes recorded.`, "success");
}

async function setupStudySessionForReader(noteId, preferredFileId) {
    if (!isAuthenticated()) return;
    const currentToken = getAccessToken();
    const status = document.getElementById("study-session-status");
    if (status) status.textContent = "Loading your private study activity...";
    try {
        const data = await fetchStudyDashboard();
        if (getAccessToken() !== currentToken || activePublicReader?.noteId !== noteId) return;
        notesState.studyDashboard = data;
        notesState.studyActiveSession = (data.sessions || []).find(s => s.status === "active") || null;
        renderStudySessionControls(noteId);
        const remembered = (data.continueStudying || []).find(item => item.noteId === noteId && item.available);
        // An explicit file switch made while this request was in flight wins.
        if (activePublicReader.manualSelection) return;
        const targetFile = preferredFileId || remembered?.fileId;
        const index = targetFile ? activePublicReader.files.findIndex(file => file.fileId === targetFile) : -1;
        if (index >= 0) {
            if (index !== activePublicReader.index) displayPublicSource(index, false, false);
        } else if (activePublicReader.files[0]?.fileId) {
            // Create an initial resume point only after checking for an existing one.
            saveStudySource(noteId, activePublicReader.files[0].fileId);
        }
    } catch (error) {
        if (activePublicReader?.noteId !== noteId) return;
        if (status) status.textContent = "Study activity unavailable. You can still read this note.";
    }
}

// Private study notes and highlights. Highlight anchors reference one stable
// extracted-preview text block; never attempt to annotate browser-owned PDF iframes.
let readerAnnotations = [];
let readerSelectedExcerpt = null;
let readerAnnotationsReady = false;
let annotationRequestVersion = 0;

function readerAnnotationTargets() {
    const root = document.getElementById("source-active-viewer");
    if (!root) return [];
    const targets = root.querySelectorAll(
        ".document-preview-body > p, .document-preview-body > h1, .document-preview-body > h2, " +
        ".document-preview-body > h3, .document-preview-body > h4, .document-preview-body > h5, " +
        ".document-preview-body > h6, .document-preview-table td, .ppt-slide-content h4, .ppt-slide-content li"
    );
    return Array.from(targets).map((node, index) => {
        node.dataset.studyTarget = String(index);
        return node;
    });
}

function applyReaderHighlights() {
    const reader = activePublicReader;
    if (!reader) return;
    const fileId = reader.files[reader.index]?.fileId;
    const targets = readerAnnotationTargets();
    for (const target of targets) {
        // Our extracted-preview targets contain plain text; reconstruct safely
        // from textContent to avoid stale/nested marks when an item is removed.
        const source = target.textContent || "";
        const index = Number(target.dataset.studyTarget);
        const annotations = readerAnnotations.filter(item => item.kind === "highlight" &&
            item.fileId === fileId && item.anchor?.target === index &&
            source.slice(item.anchor.start, item.anchor.end) === item.anchor.quote);
        annotations.sort((a,b) => a.anchor.start - b.anchor.start || a.anchor.end - b.anchor.end);
        const fragments = document.createDocumentFragment();
        let cursor = 0;
        for (const item of annotations) {
            const {start,end} = item.anchor;
            if (start < cursor || end <= start) continue;
            fragments.append(document.createTextNode(source.slice(cursor, start)));
            const mark = document.createElement("mark");
            mark.className = "reader-private-highlight";
            mark.dataset.color = item.color || "yellow";
            mark.dataset.highlightId = item.id;
            mark.textContent = source.slice(start, end);
            mark.title = "Your private highlight";
            fragments.append(mark);
            cursor = end;
        }
        fragments.append(document.createTextNode(source.slice(cursor)));
        target.replaceChildren(fragments);
    }
}

function captureReaderSelection() {
    const reader = activePublicReader;
    if (!isAuthenticated() || !reader) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement : range.startContainer;
    const endElement = range.endContainer.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentElement : range.endContainer;
    const startTarget = startElement?.closest?.("[data-study-target]");
    const endTarget = endElement?.closest?.("[data-study-target]");
    if (!startTarget || startTarget !== endTarget ||
        !document.getElementById("source-active-viewer")?.contains(startTarget)) {
        readerSelectedExcerpt = null;
        return;
    }
    const excerpt = range.toString();
    if (!excerpt.trim() || excerpt.length > 500) {
        readerSelectedExcerpt = null;
        const status = document.getElementById("reader-annotation-status");
        if (status) status.textContent = "Select up to 500 characters within a single preview paragraph or slide item.";
        return;
    }
    const before = range.cloneRange();
    before.selectNodeContents(startTarget);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const end = start + excerpt.length;
    if (startTarget.textContent.slice(start, end) !== excerpt) return;
    readerSelectedExcerpt = {
        noteId: reader.noteId,
        fileId: reader.files[reader.index]?.fileId,
        anchor: {target: Number(startTarget.dataset.studyTarget), start, end, quote: excerpt},
    };
    const status = document.getElementById("reader-annotation-status");
    if (status) status.textContent = `Selected ${excerpt.length} characters for highlighting.`;
}

document.addEventListener("selectionchange", () => {
    if (document.getElementById("source-active-viewer") && isAuthenticated()) {
        captureReaderSelection();
    }
});

function renderReaderAnnotations() {
    const reader = activePublicReader;
    const list = document.getElementById("reader-annotations-list");
    if (!reader || !list) return;
    const fileId = reader.files[reader.index]?.fileId;
    const items = readerAnnotations.filter(item => item.fileId === fileId);
    list.replaceChildren();
    if (!items.length) {
        list.innerHTML = '<p class="status-text">No private notes or highlights on this source yet.</p>';
    }
    for (const item of items) {
        const card = document.createElement("article");
        card.className = "reader-annotation-card";
        const label = item.kind === "highlight" ? "Highlight" : "Personal note";
        card.innerHTML = `<div><strong>${label}</strong>${item.kind === "highlight"
            ? `<p class="reader-annotation-quote">“${escapeHtml(item.anchor?.quote || "")}”</p>`
            : `<p>${escapeHtml(item.text)}</p>`}</div>
            <button type="button" class="button button-text" aria-label="Remove ${label.toLowerCase()}">Remove</button>`;
        card.querySelector("button").addEventListener("click", async (event) => {
            const button = event.currentTarget;
            const token = getAccessToken();
            button.disabled = true;
            try {
                const response = await authenticatedFetch(
                    `/api/study/annotations/${encodeURIComponent(reader.noteId)}/${encodeURIComponent(item.id)}`,
                    {method: "DELETE"});
                if (!response.ok) throw new Error("Unable to remove annotation.");
                if (activePublicReader?.noteId !== reader.noteId || token !== getAccessToken()) return;
                readerAnnotations = readerAnnotations.filter(entry => entry.id !== item.id);
                readerSelectedExcerpt = null;
                applyReaderHighlights();
                renderReaderAnnotations();
            } catch (error) {
                button.disabled = false;
                showAppNotice(error.message, "error");
            }
        });
        list.append(card);
    }
    const supported = /\.(docx|pages|pptx)$/i.test(reader.files[reader.index]?.filename || "");
    const hint = document.getElementById("reader-highlight-hint");
    const button = document.getElementById("reader-highlight-submit");
    if (button) button.disabled = !supported || !readerAnnotationsReady;
    const saveNote = document.getElementById("reader-annotation-submit");
    if (saveNote) saveNote.disabled = !readerAnnotationsReady;
    if (hint) hint.textContent = supported
        ? "Select text within one paragraph, heading or slide item, then choose a color and save the highlight."
        : "Inline highlighting is available for Word, Pages and PowerPoint previews. Personal notes work on any source.";
}

async function loadReaderAnnotations(noteId) {
    if (!isAuthenticated()) return;
    const version = ++annotationRequestVersion;
    readerAnnotationsReady = false;
    renderReaderAnnotations();
    const retry = document.getElementById("reader-annotations-retry");
    if (retry) retry.hidden = true;
    const token = getAccessToken();
    const status = document.getElementById("reader-annotation-status");
    if (status) status.textContent = "Loading private annotations...";
    try {
        const response = await authenticatedFetch(`/api/study/annotations/${encodeURIComponent(noteId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load annotations.");
        if (version !== annotationRequestVersion || token !== getAccessToken() ||
            activePublicReader?.noteId !== noteId) return;
        readerAnnotations = data.annotations || [];
        readerAnnotationsReady = true;
        if (retry) retry.hidden = true;
        if (status) status.textContent = "Only you can see these annotations.";
        applyReaderHighlights();
        renderReaderAnnotations();
    } catch (error) {
        if (version !== annotationRequestVersion || activePublicReader?.noteId !== noteId) return;
        readerAnnotationsReady = false;
        renderReaderAnnotations();
        if (retry) retry.hidden = false;
        if (status) status.textContent = error.message || "Private annotations are unavailable.";
    }
}

async function addReaderAnnotation(kind) {
    const reader = activePublicReader;
    if (!reader || !isAuthenticated() || !readerAnnotationsReady) return;
    const token = getAccessToken();
    const noteId = reader.noteId, fileId = reader.files[reader.index]?.fileId;
    const textInput = document.getElementById("reader-annotation-text");
    const status = document.getElementById("reader-annotation-status");
    const text = (textInput?.value || "").trim();
    if (kind === "note" && !text) {
        if (status) status.textContent = "Write your note first.";
        return;
    }
    const selected = readerSelectedExcerpt;
    if (kind === "highlight" && (!selected || selected.noteId !== noteId || selected.fileId !== fileId)) {
        if (status) status.textContent = "Select text inside this source's extracted preview first.";
        return;
    }
    if (kind === "highlight") {
        const overlap = readerAnnotations.some(item => item.kind === "highlight" &&
            item.fileId === fileId && item.anchor?.target === selected.anchor.target &&
            item.anchor.start < selected.anchor.end && selected.anchor.start < item.anchor.end);
        if (overlap) {
            if (status) status.textContent = "That text overlaps an existing highlight. Remove the old highlight first.";
            return;
        }
    }
    const button = document.getElementById(kind === "note" ? "reader-annotation-submit" : "reader-highlight-submit");
    button.disabled = true;
    try {
        const payload = {kind, fileId, text: kind === "note" ? text : ""};
        if (kind === "highlight") {
            payload.anchor = selected.anchor;
            payload.color = document.getElementById("reader-highlight-color").value;
        }
        const response = await authenticatedFetch(`/api/study/annotations/${encodeURIComponent(noteId)}`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to save annotation.");
        if (activePublicReader?.noteId !== noteId || token !== getAccessToken()) return;
        readerAnnotations.unshift(data.annotation);
        if (data.saved === true) {
            const saveButton = document.getElementById("save-public-note");
            if (saveButton?.dataset.noteId === noteId) {
                saveButton.dispatchEvent(new Event("study:auto-saved"));
            }
        }
        if (kind === "note") textInput.value = "";
        readerSelectedExcerpt = null;
        window.getSelection()?.removeAllRanges();
        applyReaderHighlights();
        renderReaderAnnotations();
        if (status) status.textContent = data.saved === true
            ? "Saved privately. This note was also added to Saved Notes."
            : "Saved privately to your account.";
    } catch (error) {
        if (status) status.textContent = error.message || "Unable to save annotation.";
    } finally {
        if (button?.isConnected) button.disabled = false;
    }
}

function setupReaderAnnotations(noteId) {
    if (!isAuthenticated()) return;
    readerAnnotationsReady = false;
    readerAnnotations = [];
    readerSelectedExcerpt = null;
    document.getElementById("reader-annotation-submit")?.addEventListener("click", () => addReaderAnnotation("note"));
    document.getElementById("reader-highlight-submit")?.addEventListener("click", () => addReaderAnnotation("highlight"));
    document.getElementById("reader-annotations-retry")?.addEventListener("click", () => loadReaderAnnotations(noteId));
    renderReaderAnnotations();
    loadReaderAnnotations(noteId);
}

// Source navigation keeps one viewer mounted at a time to avoid expensive
// simultaneous document previews on large notes or mobile devices.
let activePublicReader = null;
let sourceRenderVersion = 0;

async function displayPublicSource(index, focusHeading = false, savePosition = true) {
    const reader = activePublicReader;
    if (!reader) return;
    const next = Math.max(0, Math.min(reader.files.length - 1, Number(index) || 0));
    if (!reader.files.length) return;
    reader.index = next;
    if (savePosition) {
        reader.manualSelection = true;
        saveStudySource(reader.noteId, reader.files[next].fileId);
    }
    const version = ++sourceRenderVersion;
    readerSelectedExcerpt = null;
    const container = document.getElementById("source-active-viewer");
    if (!container || container.dataset.readerNote !== reader.noteId) return;
    const file = reader.files[next];
    container.innerHTML = renderEmbeddedSource(file, next);
    renderReaderAnnotations();
    const status = document.getElementById("source-position");
    if (status) status.textContent = `Source ${next + 1} of ${reader.files.length}`;
    document.getElementById("source-previous").disabled = next === 0;
    document.getElementById("source-next").disabled = next === reader.files.length - 1;
    document.querySelectorAll("[data-reader-source]").forEach((button) => {
        const selected = Number(button.dataset.readerSource) === next;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-current", selected ? "true" : "false");
        button.setAttribute("aria-pressed", String(selected));
    });
    if (focusHeading) {
        container.querySelector(".source-viewer-header h3")?.setAttribute("tabindex", "-1");
        container.querySelector(".source-viewer-header h3")?.focus({preventScroll: true});
    }
    // Existing native document preview loaders only inspect mounted elements.
    // A file switch invalidates earlier preview responses by detaching the node.
    await Promise.all([
        loadNativeExcelPreviews(reader.noteId),
        loadNativePowerPointPreviews(reader.noteId),
        loadNativeDocumentPreviews(reader.noteId)
    ]);
    if (version !== sourceRenderVersion) return;
    applyReaderHighlights();
}

function setupPublicSourceReader(noteId, files) {
    activePublicReader = {noteId, files, index: 0, manualSelection: false};
    const container = document.getElementById("source-active-viewer");
    if (!container) return;
    container.dataset.readerNote = noteId;
    document.querySelectorAll("[data-reader-source]").forEach((button) => {
        button.addEventListener("click", () => displayPublicSource(Number(button.dataset.readerSource), true));
    });
    document.getElementById("source-previous")?.addEventListener("click", () => displayPublicSource(activePublicReader.index - 1, true));
    document.getElementById("source-next")?.addEventListener("click", () => displayPublicSource(activePublicReader.index + 1, true));
    // Do not overwrite a previous resume position before it has loaded.
    displayPublicSource(0, false, false);
}

async function openPublicNote(noteId, updateUrl = true, preferredFileId = null) {
    ++publicBrowseRequestVersion;
    ++sourceRenderVersion;
    ++annotationRequestVersion;
    readerAnnotations = [];
    readerSelectedExcerpt = null;
    readerAnnotationsReady = false;
    activePublicReader = null;
    exitPublicReaderFocus();
    document.getElementById("public-contributor-detail").hidden = true;
    const grid = document.getElementById("public-grid");
    const detail = document.getElementById("public-note-detail");
    const content = document.getElementById("public-note-content");

    try {
        const response = await fetch(apiUrl(`/api/public/notes/${encodeURIComponent(noteId)}`));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to open note.");

        const note = data.note;
        const files = note.files || [];
        const ownsNote = notesState.notes.some((ownedNote) => ownedNote.noteId === note.noteId);
        const canReportNote = isAuthenticated() && !ownsNote;
        const reportState = canReportNote
            ? await getPublicNoteReportStatus(note.noteId)
            : {reported: false, report: null};
        const publishedDate = formatDate(note.publishedAt);

        if (updateUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set("note", noteId);
            window.history.replaceState({}, "", url);
        }

        const sourceIndex = files.length > 1
            ? `
                <nav class="public-source-index" aria-label="Choose a source file">
                    ${files.map((file, index) => `
                        <button type="button" class="public-source-index-item" data-reader-source="${index}" aria-pressed="${index === 0 ? "true" : "false"}">
                            <span>${index + 1}</span>
                            <strong>${escapeHtml(file.filename || `Source ${index + 1}`)}</strong>
                        </button>
                    `).join("")}
                </nav>
            `
            : "";
        content.innerHTML = `
            <section class="public-note-hero">
                <div class="public-note-hero-main">
                    <div class="public-note-taxonomy" aria-label="Browse note categories">
                        ${note.subject ? `<button class="subject-chip public-taxonomy-link" id="browse-note-subject" type="button" aria-label="Explore subject ${escapeHtml(note.subject)}">${escapeHtml(note.subject)}</button>` : ""}
                        ${note.collection ? `<button class="public-topic-label public-taxonomy-link" id="browse-note-topic" type="button" aria-label="Explore topic ${escapeHtml(note.collection)} in ${escapeHtml(note.subject || "all subjects")}">${escapeHtml(note.collection)}</button>` : ""}
                    </div>
                    <h2>${escapeHtml(note.title)}</h2>
                    <p class="public-note-full-description">${escapeHtml(note.description || "No description provided.")}</p>
                </div>

                <div class="public-note-hero-side">
                    <div class="public-note-byline">
                        ${note.contributorId ? `<a class="public-contributor-link" id="note-contributor-link" href="${escapeHtml(contributorShareUrl(note.contributorId))}">${escapeHtml(note.publicAuthor || "Community member")}</a>` : `<strong>${escapeHtml(note.publicAuthor || "Community member")}</strong>`}
                        <span>${Number(note.viewCount || 0)} view${Number(note.viewCount || 0) === 1 ? "" : "s"}</span>
                        <span id="public-helpful-count">${Number(note.helpfulCount || 0).toLocaleString()} helpful votes</span>
                        ${publishedDate ? `<span>Published ${escapeHtml(publishedDate)}</span>` : ""}
                    </div>
                    <div class="public-helpful-actions">
                        <button id="helpful-public-note" type="button" class="button button-secondary" data-note-id="${escapeHtml(note.noteId)}" aria-pressed="false">♡ Helpful</button>
                        <span id="helpful-public-feedback" class="status-text" role="status" aria-live="polite"></span>
                    </div>
                    <div class="public-save-actions">
                        <button id="save-public-note" type="button" class="button button-secondary" data-note-id="${escapeHtml(note.noteId)}">☆ Save Note</button>
                        <span id="save-public-feedback" class="status-text" role="status" aria-live="polite"></span>
                    </div>
                    <button id="share-public-note" class="button button-secondary" type="button">Copy Share Link</button>
                    ${notesState.isAdmin ? '<button id="feature-public-note" type="button" class="button button-secondary">Feature on Home</button>' : ""}
                    ${canReportNote ? `
                        <button
                            id="report-note-trigger"
                            class="report-note-trigger"
                            type="button"
                            ${reportState.reported ? "disabled" : ""}
                        >
                            ${reportState.reported ? "Already reported" : "Report note"}
                        </button>

                        ${reportState.reported ? "" : `
                            <div id="report-note-modal" class="report-note-modal" hidden>
                                <button class="report-note-backdrop" type="button" aria-label="Close report form"></button>
                                <section class="report-note-dialog" role="dialog" aria-modal="true" aria-labelledby="report-note-title">
                                    <div class="report-note-dialog-heading">
                                        <div>
                                            <p class="eyebrow">Community safety</p>
                                            <h3 id="report-note-title">Report this note</h3>
                                            <p>Tell us what is wrong and the moderation team will review it.</p>
                                        </div>
                                        <button id="report-note-close" class="button button-text" type="button" aria-label="Close">Close</button>
                                    </div>
                                    <label>
                                        Reason
                                        <select id="report-note-reason">
                                            <option value="">Choose a reason</option>
                                            <option value="spam">Spam</option>
                                            <option value="inappropriate">Inappropriate content</option>
                                            <option value="copyright">Copyright concern</option>
                                            <option value="misleading">Misleading or inaccurate</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </label>
                                    <label>
                                        Details <span>(optional)</span>
                                        <textarea id="report-note-details" maxlength="1000" rows="4" placeholder="Add context for the moderation team."></textarea>
                                    </label>
                                    <div class="report-note-dialog-actions">
                                        <span id="report-note-status" class="status-text" aria-live="polite"></span>
                                        <div>
                                            <button id="report-note-cancel" class="button button-text" type="button">Cancel</button>
                                            <button id="report-note-submit" class="button button-primary" type="button">Submit report</button>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        `}
                    ` : ""}
                </div>
            </section>

            <section class="public-sources-section">
                ${isAuthenticated() ? `
                    <div class="study-session-bar" role="group" aria-label="Your private study session">
                        <div><strong>Study session</strong><p id="study-session-status" role="status" aria-live="polite">Loading your private study activity...</p></div>
                        <button type="button" id="start-study-session" class="button button-secondary" hidden>Start studying</button>
                        <button type="button" id="finish-study-session" class="button button-primary" hidden>Finish session</button>
                    </div>
                ` : ""}
                <div class="reader-preferences-bar" role="group" aria-label="Reader controls">
                    <button id="reader-focus-toggle" type="button" class="button button-secondary" aria-pressed="false">Focus mode</button>
                    <label for="reader-text-size">Text size
                        <select id="reader-text-size" aria-label="Preview text size">
                            <option value="normal">Normal</option>
                            <option value="large">Large</option>
                            <option value="extra">Extra large</option>
                        </select>
                    </label>
                    <label for="reader-width">Reading width
                        <select id="reader-width" aria-label="Reading width">
                            <option value="wide">Wide</option>
                            <option value="comfortable">Comfortable</option>
                        </select>
                    </label>
                </div>
                <p class="reader-preferences-hint">Text size changes StudyGrounds document previews. PDF zoom and page controls remain in your browser's PDF viewer.</p>
                <div class="public-sources-heading">
                    <div>
                        <p class="eyebrow">Source material</p>
                        <h3>${files.length} source file${files.length === 1 ? "" : "s"}</h3>
                    </div>
                    ${files.length > 1 ? '<span class="status-text">Select a file below to switch previews</span>' : ""}
                </div>

                ${sourceIndex}
                ${files.length ? `
                    <div class="reader-source-toolbar" aria-label="Source navigation">
                        <button id="source-previous" type="button" class="button button-secondary" disabled>← Previous file</button>
                        <span id="source-position" role="status" aria-live="polite">Source 1 of ${files.length}</span>
                        <button id="source-next" type="button" class="button button-secondary" ${files.length === 1 ? "disabled" : ""}>Next file →</button>
                    </div>
                    <div id="source-active-viewer" class="source-viewer-list"></div>
                ` : '<p class="note-description">No source files are available for this note.</p>'}
                ${isAuthenticated() && files.length ? `
                    <section class="reader-annotations-panel" aria-label="Your private study annotations">
                        <div class="reader-annotations-title">
                            <div><h3>Your private study notes</h3><p>Visible only to your account. The original uploaded document is unchanged.</p></div>
                        </div>
                        <label for="reader-annotation-text">Personal note for this source</label>
                        <textarea id="reader-annotation-text" maxlength="1000" rows="3" placeholder="Write something to remember..."></textarea>
                        <button id="reader-annotation-submit" type="button" class="button button-secondary">Save personal note</button>
                        <div class="reader-highlight-controls">
                            <label for="reader-highlight-color">Highlight color</label>
                            <select id="reader-highlight-color">
                                <option value="yellow">Yellow</option><option value="blue">Blue</option>
                                <option value="green">Green</option><option value="pink">Pink</option>
                            </select>
                            <button id="reader-highlight-submit" type="button" class="button button-secondary">Highlight selected text</button>
                        </div>
                        <p id="reader-highlight-hint" class="status-text"></p>
                        <p id="reader-annotation-status" class="status-text" role="status" aria-live="polite"></p>
                        <button id="reader-annotations-retry" type="button" class="button button-secondary" hidden>Retry loading private notes</button>
                        <div id="reader-annotations-list" class="reader-annotations-list"></div>
                    </section>
                ` : ""}
            </section>

            <section id="related-public-notes" class="related-public-section" data-note-id="${escapeHtml(note.noteId)}" aria-label="Related study notes" hidden></section>
        `;

        grid.hidden = true;
        document.querySelector(".explore-controls")?.setAttribute("hidden", "");
        document.getElementById("public-status").hidden = true;
        detail.hidden = false;
        setupPublicReaderControls();
        initializeSaveButton(note.noteId);
        initializeHelpfulButton(note);
        loadRelatedPublicNotes(note);
        document.getElementById("browse-note-subject")?.addEventListener("click", () => browsePublicTaxonomy(note.subject));
        document.getElementById("browse-note-topic")?.addEventListener("click", () => browsePublicTaxonomy(note.subject, note.collection));
        document.getElementById("note-contributor-link")?.addEventListener("click", (event) => {
            event.preventDefault();
            openPublicContributor(note.contributorId);
        });
        document.getElementById("share-public-note")?.addEventListener("click", (event) => sharePublicNote(noteId, note.title, event));
        const featureButton = document.getElementById("feature-public-note");
        if (featureButton) {
            featureButton.textContent = featuredHomeNoteId === noteId ? "Remove from Home" : "Feature on Home";
            featureButton.addEventListener("click", async () => {
                featureButton.disabled = true;
                try {
                    const remove = featuredHomeNoteId === noteId;
                    const options = remove ? {method:"DELETE"} : {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({noteId})};
                    const response = await adminFetch("/api/admin/featured-note", options);
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || "Unable to change featured note.");
                    await loadFeaturedHome();
                    featureButton.textContent = featuredHomeNoteId === noteId ? "Remove from Home" : "Feature on Home";
                    showAppNotice(remove ? "Featured note removed." : "Note featured on Home.", "success");
                } catch(error) { showAppNotice(error.message, "error"); }
                finally {featureButton.disabled = false;}
            });
        }

        document.getElementById("report-note-trigger")?.addEventListener("click", openReportNoteModal);
        document.getElementById("report-note-submit")?.addEventListener("click", () => submitPublicNoteReport(noteId));
        document.getElementById("report-note-close")?.addEventListener("click", closeReportNoteModal);
        document.getElementById("report-note-cancel")?.addEventListener("click", closeReportNoteModal);
        document.querySelector(".report-note-backdrop")?.addEventListener("click", closeReportNoteModal);
        if (files.length) setupPublicSourceReader(noteId, files);
        if (isAuthenticated() && files.length) setupReaderAnnotations(noteId);
        if (isAuthenticated()) {
            document.getElementById("start-study-session")?.addEventListener("click", () => startStudySession(noteId));
            document.getElementById("finish-study-session")?.addEventListener("click", async (event) => {
                const session = notesState.studyActiveSession;
                if (!session) return;
                event.currentTarget.disabled = true;
                try {
                    await finishStudySession(session);
                } catch (error) {
                    showAppNotice(error.message, "error");
                } finally {
                    if (event.currentTarget.isConnected) event.currentTarget.disabled = false;
                }
            });
            setupStudySessionForReader(noteId, preferredFileId);
        }
    } catch (error) {
        detail.hidden = true;
        content.innerHTML = "";
        document.querySelector(".explore-controls")?.removeAttribute("hidden");
        grid.hidden = false;
        setPublicStatus(error.message || "Unable to open note.", true);
    }
}

// Home cards reuse study history, saved notes and public discovery APIs.
function homeRequestCurrent(version, token) {
    return notesState.activeView === "home" && version === notesState.homeLoadVersion && token === getAccessToken();
}
function homeMessage(container, message) {
    container.replaceChildren();
    const p = document.createElement("p");
    p.className = "note-description";
    p.textContent = message;
    container.append(p);
}
function homeEntry(note, meta, label, fileId = null) {
    const item = document.createElement("article");
    item.className = "home-note-item";
    const detail = document.createElement("div");
    detail.className = "home-note-details";
    const heading = document.createElement("h4");
    heading.textContent = note.title || "Untitled note";
    const text = document.createElement("p");
    text.className = "note-description";
    text.textContent = meta;
    detail.append(heading, text);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "button button-secondary";
    action.textContent = label;
    action.addEventListener("click", () => {
        if (!note.noteId) return;
        setActiveView("explore", {skipExploreLoad: true});
        openPublicNote(note.noteId, true, fileId);
    });
    item.append(detail, action);
    return item;
}
async function loadHomeDashboard() {
    const version = ++notesState.homeLoadVersion;
    const token = getAccessToken();
    const signedIn = isAuthenticated();
    const progress = document.getElementById("home-continue-list");
    const saved = document.getElementById("home-saved-list");
    const trending = document.getElementById("home-trending-list");
    if (signedIn) {
        homeMessage(progress, "Loading study activity...");
        homeMessage(saved, "Loading saved notes...");
    } else {
        progress.replaceChildren();
        saved.replaceChildren();
    }
    homeMessage(trending, "Loading trending notes...");
    const jobs = [];
    if (signedIn) {
        jobs.push((async () => {
            try {
                const data = await fetchStudyDashboard();
                if (!homeRequestCurrent(version, token)) return;
                const items = (data.continueStudying || []).filter(x => x.available).slice(0, 3);
                progress.replaceChildren();
                if (!items.length) return homeMessage(progress, "No recent study activity. Open a note to get started.");
                for (const x of items) progress.append(homeEntry(x,
                    [x.subject || "Study material", x.lastOpenedAt ? "Last opened " + friendlyStudyDate(x.lastOpenedAt) : ""].filter(Boolean).join(" · "),
                    "Resume", x.fileId || null));
            } catch (error) {
                if (homeRequestCurrent(version, token)) homeMessage(progress, "Could not load recent study activity.");
            }
        })());
        jobs.push((async () => {
            try {
                const response = await authenticatedFetch("/api/saved-notes");
                const data = await response.json();
                if (!homeRequestCurrent(version, token)) return;
                if (!response.ok) throw new Error(data.error || "Saved notes unavailable.");
                const items = (data.notes || []).filter(x => x.available).slice(0, 3);
                saved.replaceChildren();
                if (!items.length) return homeMessage(saved, "Nothing saved yet. Save a public note from Explore.");
                for (const x of items) saved.append(homeEntry(x,
                    [x.subject || "Study material", x.savedAt ? "Saved " + formatDate(x.savedAt) : ""].filter(Boolean).join(" · "),
                    "Open"));
            } catch (error) {
                if (homeRequestCurrent(version, token)) homeMessage(saved, "Could not load recently saved notes.");
            }
        })());
    }
    jobs.push((async () => {
        try {
            const response = await fetch(apiUrl("/api/public/notes?sort=trending&page=1&pageSize=3"));
            const data = await response.json();
            if (!homeRequestCurrent(version, token)) return;
            if (!response.ok) throw new Error(data.error || "Trending notes unavailable.");
            const items = (data.notes || []).slice(0, 3);
            trending.replaceChildren();
            if (!items.length) return homeMessage(trending, "No community notes available yet.");
            for (const x of items) trending.append(homeEntry(x,
                [x.subject || "Study material", Number(x.helpfulCount || 0).toLocaleString() + " helpful"].join(" · "),
                "Read"));
        } catch (error) {
            if (homeRequestCurrent(version, token)) homeMessage(trending, "Could not load trending notes.");
        }
    })());
    await Promise.allSettled(jobs);
}

// Member feedback and administrator triage.
let feedbackCursor = null;
let feedbackRequestVersion = 0;
async function sendAppFeedback(event) {
    event.preventDefault();
    const button = document.getElementById("feedback-submit");
    const status = document.getElementById("feedback-status");
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = "Sending feedback...";
    try {
        const payload = {
            category: document.getElementById("feedback-category").value,
            subject: document.getElementById("feedback-subject").value.trim(),
            details: document.getElementById("feedback-details").value.trim(),
            context: document.getElementById("feedback-context").value.trim()
        };
        const response = await authenticatedFetch("/api/feedback", {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to send feedback.");
        document.getElementById("feedback-form").reset();
        status.textContent = data.message || "Feedback sent. Thank you!";
        showAppNotice("Thanks for your feedback!", "success");
    } catch(error) { status.textContent = error.message || "Unable to send feedback."; }
    finally { button.disabled = false; }
}
async function loadAdminFeedback(append = false) {
    const version = ++feedbackRequestVersion;
    const status = document.getElementById("feedback-admin-status");
    const list = document.getElementById("feedback-admin-items");
    const more = document.getElementById("feedback-admin-more");
    if (!append) {feedbackCursor = null; list.replaceChildren();}
    status.textContent = "Loading feedback...";
    more.hidden = true;
    try {
        const filter = document.getElementById("feedback-admin-filter").value;
        const qs = new URLSearchParams();
        if (filter) qs.set("status", filter);
        if (append && feedbackCursor) qs.set("cursor", feedbackCursor);
        const response = await adminFetch("/api/admin/feedback" + (qs.size ? "?" + qs.toString() : ""));
        const data = await response.json();
        if (version !== feedbackRequestVersion) return;
        if (!response.ok) throw new Error(data.error || "Unable to load feedback.");
        const entries = data.feedback || [];
        for (const item of entries) {
            const row = document.createElement("article");
            row.className = "feedback-admin-item";
            const heading = document.createElement("h3");
            heading.textContent = item.subject || "Untitled";
            const meta = document.createElement("p");
            meta.className = "note-description";
            meta.textContent = [item.category, item.email || item.userId, item.createdAt ? new Date(item.createdAt).toLocaleString() : ""].filter(Boolean).join(" · ");
            const details = document.createElement("p");
            details.className = "feedback-details";
            details.textContent = item.details || "";
            row.append(heading, meta, details);
            if (item.context) {
                const context = document.createElement("p");
                context.className = "note-description";
                context.textContent = "Page/feature: " + item.context;
                row.append(context);
            }
            const select = document.createElement("select");
            select.setAttribute("aria-label", "Feedback status for " + (item.subject || "untitled feedback"));
            for (const [value,label] of [["NEW","New"],["IN_REVIEW","In Review"],["RESOLVED","Resolved"]]) {
                const option = document.createElement("option");
                option.value = value; option.textContent = label; option.selected = value === item.status;
                select.append(option);
            }
            select.addEventListener("change", async () => {
                const previous = item.status;
                select.disabled = true;
                try {
                    const r = await adminFetch("/api/admin/feedback/" + encodeURIComponent(item.feedbackId), {
                        method: "PATCH", headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({status: select.value})
                    });
                    const responseData = await r.json();
                    if (!r.ok) throw new Error(responseData.error || "Unable to update status.");
                    item.status = select.value;
                    showAppNotice("Feedback status updated.", "success");
                } catch(error) {
                    select.value = previous;
                    showAppNotice(error.message, "error");
                } finally {select.disabled = false;}
            });
            row.append(select);
            list.append(row);
        }
        feedbackCursor = data.nextCursor || null;
        more.hidden = !feedbackCursor;
        status.textContent = entries.length ? "" : (append ? "No more feedback on this page." : "No feedback found.");
    } catch(error) {if (version === feedbackRequestVersion) status.textContent = error.message || "Unable to load feedback.";}
}

let featuredHomeNoteId = null;
let featuredHomeVersion = 0;
async function loadFeaturedHome() {
    const version = ++featuredHomeVersion;
    const featured = document.getElementById("home-featured");
    const hidden = document.getElementById("home-featured-hidden");
    const restore = document.getElementById("settings-restore-featured");
    const status = document.getElementById("home-featured-status");
    featured.hidden = true; hidden.hidden = true; restore.disabled = true; status.textContent = "";
    featuredHomeNoteId = null;
    try {
        const response = await fetch(apiUrl("/api/featured-note"));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load featured note.");
        if (version !== featuredHomeVersion || !data.note) return;
        const note = data.note;
        featuredHomeNoteId = note.noteId;
        let dismissed = false;
        if (isAuthenticated()) {
            const r = await authenticatedFetch("/api/featured-note/dismissal");
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || "Unable to load preference.");
            if (version !== featuredHomeVersion) return;
            dismissed = d.noteId === note.noteId && !!d.dismissed;
        }
        document.getElementById("home-featured-title").textContent = note.title || "Featured study note";
        document.getElementById("home-featured-description").textContent = note.description || "";
        document.getElementById("home-featured-hide").hidden = !isAuthenticated();
        featured.hidden = dismissed; hidden.hidden = !dismissed; restore.disabled = !dismissed;
    } catch (error) {
        if (version === featuredHomeVersion) status.textContent = error.message || "Featured note unavailable.";
    }
}
async function changeFeaturedDismissal(hide) {
    if (!featuredHomeNoteId || !isAuthenticated()) return;
    const previous = featuredHomeNoteId;
    try {
        const response = await authenticatedFetch("/api/featured-note/dismissal", {method:hide ? "PUT" : "DELETE"});
        const data = await response.json();
        if (!response.ok || data.noteId !== previous) throw new Error(data.error || "Featured note changed. Retry.");
        await loadFeaturedHome();
        showAppNotice(hide ? "Featured note hidden." : "Featured note restored.", "success");
    } catch(error) { showAppNotice(error.message || "Unable to update preference.", "error"); }
}

window.addEventListener("focus", () => {
    if (!isAuthenticated()) {
        if (getAccessToken() || sessionStorage.getItem("id_token")) expireLocalSession();
        else renderSignedInState();
        return;
    }
    loadNotifications();
    if (notesState.activeView === "my-notes") loadNotes();
    if (notesState.activeView === "saved-notes") loadSavedNotes();
    if (notesState.activeView === "study-history") loadStudyDashboard();
    if (notesState.activeView === "home") {
        loadFeaturedHome();
        loadHomeDashboard();
    }
});

document.addEventListener("DOMContentLoaded", async () => {
    renderSignedInState();
    await loadPublicTaxonomy();

    document.getElementById("hero-sign-in-btn").addEventListener("click", signIn);
    document.getElementById("notifications-toggle").addEventListener("click", () => toggleNotifications(!notificationsOpen));
    document.getElementById("notifications-read-all").addEventListener("click", () => markNotificationRead());
    document.addEventListener("click", event => {
        if (notificationsOpen && !document.getElementById("notifications-control").contains(event.target)) toggleNotifications(false);
    });
    document.getElementById("home-tab").addEventListener("click", () => setActiveView("home"));
    document.getElementById("home-explore").addEventListener("click", () => setActiveView("explore"));
    document.getElementById("home-sign-in").addEventListener("click", signIn);
    document.getElementById("home-history").addEventListener("click", () => setActiveView("study-history"));
    document.getElementById("home-saved").addEventListener("click", () => setActiveView("saved-notes"));
    document.getElementById("home-study-all").addEventListener("click", () => setActiveView("study-history"));
    document.getElementById("home-saved-all").addEventListener("click", () => setActiveView("saved-notes"));
    document.getElementById("home-trending-all").addEventListener("click", () => {
        document.getElementById("public-sort").value = "trending";
        notesState.publicPage = 1;
        setActiveView("explore");
    });
    document.getElementById("home-create").addEventListener("click", () => {setActiveView("my-notes"); document.getElementById("new-note-btn").click();});
    document.getElementById("home-featured-open").addEventListener("click", () => {if (featuredHomeNoteId) {setActiveView("explore"); openPublicNote(featuredHomeNoteId);}});
    document.getElementById("home-featured-hide").addEventListener("click", () => changeFeaturedDismissal(true));
    document.getElementById("home-featured-restore").addEventListener("click", () => changeFeaturedDismissal(false));
    document.getElementById("settings-restore-featured").addEventListener("click", () => changeFeaturedDismissal(false));
    document.getElementById("home-feedback").addEventListener("click", () => setActiveView("feedback"));
    document.getElementById("settings-feedback").addEventListener("click", () => setActiveView("feedback"));
    document.getElementById("feedback-tab").addEventListener("click", () => setActiveView("feedback"));
    document.getElementById("feedback-admin-tab").addEventListener("click", () => setActiveView("feedback-admin"));
    document.getElementById("admin-tab").addEventListener("click", () => setActiveView(notesState.lastAdminView));
    document.getElementById("feedback-form").addEventListener("submit", sendAppFeedback);
    document.getElementById("feedback-admin-refresh").addEventListener("click", () => loadAdminFeedback());
    document.getElementById("feedback-admin-filter").addEventListener("change", () => loadAdminFeedback());
    document.getElementById("feedback-admin-more").addEventListener("click", () => {if (feedbackCursor) loadAdminFeedback(true);});

    document.getElementById("my-notes-tab").addEventListener("click", () => setActiveView("my-notes"));
    document.getElementById("saved-notes-tab").addEventListener("click", () => setActiveView("saved-notes"));
    document.getElementById("study-history-tab").addEventListener("click", () => setActiveView("study-history"));
    document.getElementById("study-history-refresh").addEventListener("click", () => loadStudyDashboard());
    document.getElementById("saved-notes-more").addEventListener("click", () => {
        if (notesState.savedCursor) loadSavedNotes(true);
    });
    document.getElementById("explore-tab").addEventListener("click", () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("note");
        window.history.replaceState({}, "", url);
        notesState.publicPage = 1;
        setActiveView("explore");
    });
    document.getElementById("settings-tab").addEventListener("click", () => setActiveView("settings"));
    document.getElementById("settings-open-public-profile").addEventListener("click", openMyPublicProfile);
    ["settings-first-name", "settings-last-name"].forEach(id => {
        document.getElementById(id).addEventListener("input", updateSettingsAvatarPreview);
    });
    document.querySelectorAll('input[name="profile-avatar-style"]').forEach(input => {
        input.addEventListener("change", updateSettingsAvatarPreview);
    });
    document.getElementById("analytics-tab").addEventListener("click", () => setActiveView("analytics"));
    document.getElementById("security-tab").addEventListener("click", () => setActiveView("security"));
    document.getElementById("moderation-tab").addEventListener("click", () => setActiveView("moderation"));
    document.getElementById("refresh-analytics").addEventListener("click", loadAdminAnalytics);
    document.getElementById("refresh-security").addEventListener("click", () => loadAdminSecurity());
    document.getElementById("refresh-moderation").addEventListener("click", loadAdminModeration);
    document.getElementById("close-security-detail").addEventListener("click", () => {
        document.getElementById("security-user-detail").hidden = true;
        notesState.selectedSecurityUserId = null;
    });
    document.getElementById("security-restore-access").addEventListener("click", () => applySecurityAction("restore_access"));
    document.getElementById("security-forgive-strikes").addEventListener("click", () => applySecurityAction("forgive_strikes"));
    document.getElementById("security-reenable-account").addEventListener("click", () => applySecurityAction("reenable_account"));
    document.getElementById("security-disable-account").addEventListener("click", () => applySecurityAction("disable_account"));
    document.getElementById("new-note-btn").addEventListener("click", () => {
        notesState.dismissedEmptyCreate = false;
        notesState.editingNoteId = null;
        document.getElementById("create-note-form").reset();
        document.getElementById("note-form-title").textContent = "Create a note";
        document.getElementById("note-form-submit").textContent = "Create Note";
        setCreateStatus("");
        showCreatePanel(true);
    });
    document.getElementById("cancel-note-btn").addEventListener("click", () => {
        if (notesState.notes.length === 0) {
            notesState.dismissedEmptyCreate = true;
        }
        showCreatePanel(false);
        if (notesState.notes.length === 0) {
            renderNotes();
        }
    });
    document.getElementById("profile-form").addEventListener("submit", saveProfile);
    document.getElementById("settings-profile-form").addEventListener("submit", saveSettingsProfile);
    document.getElementById("create-note-form").addEventListener("submit", createNote);
    document.getElementById("note-upload-input").addEventListener("change", handleUploadSelection);
    setupSearchSelects();
    const runExploreSearch = () => {
        notesState.publicPage = 1;
        const sort = document.getElementById("public-sort");
        const query = document.getElementById("public-search").value.trim();
        if (query && (!sort.value || sort.value === "newest" || sort.value === "relevance")) {
            sort.value = "relevance";
        } else if (!query && sort.value === "relevance") {
            sort.value = "newest";
        }
        loadPublicNotes();
    };
    document.getElementById("public-search-btn").addEventListener("click", runExploreSearch);
    document.getElementById("public-search-clear").addEventListener("click", () => {
        exploreReturnScrollY = null;
        document.getElementById("public-search").value = "";
        document.getElementById("public-subject").value = "";
        document.getElementById("public-collection").value = "";
        document.getElementById("public-sort").value = "newest";
        document.getElementById("public-page-size").value = "18";
        notesState.publicPageSize = 18;
        notesState.publicPage = 1;
        loadPublicNotes();
    });
    document.getElementById("public-subject").addEventListener("change", () => {
        notesState.publicPage = 1;
        refreshExploreTopicFilter();
        loadPublicNotes();
    });
    document.getElementById("public-collection").addEventListener("change", () => {
        notesState.publicPage = 1;
        loadPublicNotes();
    });
    const activateDiscoverySort = (sort) => {
        document.getElementById("public-sort").value = sort;
        notesState.publicPage = 1;
        loadPublicNotes();
    };
    document.getElementById("explore-most-helpful").addEventListener("click", () => activateDiscoverySort("helpful"));
    document.getElementById("explore-trending").addEventListener("click", () => activateDiscoverySort("trending"));
    document.getElementById("public-sort").addEventListener("change", () => {
        notesState.publicPage = 1;
        loadPublicNotes();
    });
    document.getElementById("public-page-size").addEventListener("change", () => {
        notesState.publicPage = 1;
        notesState.publicPageSize = Number(document.getElementById("public-page-size").value || 18);
        loadPublicNotes();
    });
    document.getElementById("public-first-page").addEventListener("click", () => {
        if (notesState.publicPage > 1) {
            notesState.publicPage = 1;
            loadPublicNotes();
        }
    });
    document.getElementById("public-prev-page").addEventListener("click", () => {
        if (notesState.publicPage > 1) {
            notesState.publicPage -= 1;
            loadPublicNotes();
        }
    });
    document.getElementById("public-next-page").addEventListener("click", () => {
        if (notesState.publicPage < notesState.publicTotalPages) {
            notesState.publicPage += 1;
            loadPublicNotes();
        }
    });
    document.getElementById("public-last-page").addEventListener("click", () => {
        if (notesState.publicPage < notesState.publicTotalPages) {
            notesState.publicPage = notesState.publicTotalPages;
            loadPublicNotes();
        }
    });
    document.getElementById("public-search").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runExploreSearch();
        }
    });
    document.getElementById("close-public-contributor").addEventListener("click", backToExplore);
    document.getElementById("close-public-note").addEventListener("click", () => {
        exitPublicReaderFocus();
        activePublicReader = null;
        ++sourceRenderVersion;
        backToExplore();
    });

    if (isAuthenticated()) {
        try {
            const profile = await loadProfile();
            showProfilePanel(profile);
        } catch (error) {
            console.error("Unable to load profile:", error);
        }

        renderSignedInState();
        await probeAdminAccess();
        await loadNotes();
    }
    await loadFeaturedHome();
    if (isAuthenticated()) loadNotifications();
    if (notesState.activeView === "home") loadHomeDashboard();

    const sharedParams = new URL(window.location.href).searchParams;
    const sharedNoteId = sharedParams.get("note");
    const sharedContributorId = sharedParams.get("contributor");
    if (sharedNoteId || sharedContributorId) {
        setActiveView("explore", {skipExploreLoad: true});
        if (sharedNoteId) await openPublicNote(sharedNoteId, false);
        else await openPublicContributor(sharedContributorId, false);
    }
});
