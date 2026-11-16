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
    activeView: "my-notes",
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
    savedCursor: null
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
    if (preview) {
        preview.textContent = profile?.publicAuthor
            ? `Public notes currently show: ${profile.publicAuthor}`
            : "Complete your profile before publishing.";
    }
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
    const status = document.getElementById("settings-profile-status");
    const button = document.getElementById("settings-profile-submit");

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

function setActiveView(view) {
    notesState.activeView = view;
    document.getElementById("my-notes-view").hidden = view !== "my-notes";
    document.getElementById("explore-view").hidden = view !== "explore";
    document.getElementById("saved-notes-view").hidden = view !== "saved-notes";
    document.getElementById("settings-view").hidden = view !== "settings";
    document.getElementById("analytics-view").hidden = view !== "analytics";
    document.getElementById("security-view").hidden = view !== "security";
    document.getElementById("moderation-view").hidden = view !== "moderation";
    document.getElementById("my-notes-tab").classList.toggle("active", view === "my-notes");
    document.getElementById("explore-tab").classList.toggle("active", view === "explore");
    document.getElementById("saved-notes-tab").classList.toggle("active", view === "saved-notes");
    document.getElementById("settings-tab").classList.toggle("active", view === "settings");
    document.getElementById("analytics-tab").classList.toggle("active", view === "analytics");
    document.getElementById("security-tab").classList.toggle("active", view === "security");
    document.getElementById("moderation-tab").classList.toggle("active", view === "moderation");
    ["my-notes", "explore", "saved-notes", "settings", "analytics", "security", "moderation"].forEach((name) => {
        const button = document.getElementById(`${name}-tab`);
        if (name === view) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });

    if (view === "explore") {
        loadPublicNotes();
    } else if (view === "saved-notes") {
        loadSavedNotes();
    } else if (view === "analytics") {
        loadAdminAnalytics();
    } else if (view === "security") {
        loadAdminSecurity();
    } else if (view === "moderation") {
        loadAdminModeration();
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
    notesState.savedCursor = null;
    document.getElementById("saved-notes-grid")?.replaceChildren();
    clearTokens();
    notesState.notes = [];
    notesState.profile = null;
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
    const signedOutPanel = document.getElementById("signed-out-panel");
    const notesApp = document.getElementById("notes-app");
    const myNotesTab = document.getElementById("my-notes-tab");
    const savedTab = document.getElementById("saved-notes-tab");
    const settingsTab = document.getElementById("settings-tab");
    const analyticsTab = document.getElementById("analytics-tab");
    const securityTab = document.getElementById("security-tab");
    const moderationTab = document.getElementById("moderation-tab");

    signedOutPanel.hidden = signedIn;
    notesApp.hidden = !signedIn;
    myNotesTab.hidden = !signedIn;
    savedTab.hidden = !signedIn;
    settingsTab.hidden = !signedIn;
    analyticsTab.hidden = !signedIn || !isConfiguredAdmin();
    securityTab.hidden = !signedIn || !isConfiguredAdmin();
    moderationTab.hidden = !signedIn || !isConfiguredAdmin();

    if (!signedIn && ["my-notes", "saved-notes", "settings", "analytics", "security", "moderation"].includes(notesState.activeView)) {
        setActiveView("explore");
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
        <div class="ppt-slide-list">
            ${slides.map((slide) => {
                const body = (slide.text || [])
                    .map((line) => `<li>${escapeHtml(line)}</li>`)
                    .join("");

                return `
                    <article class="ppt-slide-card">
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

            container.innerHTML = renderPresentationSlides(data.preview || {});
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
    if (!isAuthenticated()) return false;

    try {
        const response = await adminFetch("/api/admin/analytics?probe=1");
        if (response.status === 403) {
            notesState.isAdmin = false;
            document.getElementById("analytics-tab").hidden = true;
            document.getElementById("security-tab").hidden = true;
            return false;
        }
        if (!response.ok) return false;
        notesState.isAdmin = true;
        document.getElementById("analytics-tab").hidden = !isConfiguredAdmin();
        document.getElementById("security-tab").hidden = !isConfiguredAdmin();
        return true;
    } catch (error) {
        console.error("Unable to check admin analytics access:", error);
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

        if (response.status === 403) {
            notesState.isAdmin = false;
            document.getElementById("analytics-tab").hidden = true;
            setActiveView("my-notes");
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

        if (response.status === 403) {
            notesState.isAdmin = false;
            document.getElementById("analytics-tab").hidden = true;
            document.getElementById("security-tab").hidden = true;
            setActiveView("my-notes");
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

function renderActivePublicFilters(query, subject, collection, sort) {
    const container = document.getElementById("public-active-filters");
    const items = [];

    if (query) items.push(`Search: ${query}`);
    if (subject) items.push(`Subject: ${subject}`);
    if (collection) items.push(`Topic: ${collection}`);
    if (sort && sort !== "newest") {
        const labels = {
            oldest: "Oldest",
            title: "Title A–Z",
            views: "Most viewed",
            helpful: "Most helpful",
            trending: "Trending"
        };
        items.push(`Sort: ${labels[sort] || sort}`);
    }

    container.innerHTML = items.length
        ? items.map((item) => `<span class="active-filter-chip">${escapeHtml(item)}</span>`).join("")
        : '<span class="active-filter-empty">No filters applied</span>';
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
                    <span class="subject-chip">${escapeHtml(subjectLabel)}</span>
                    <span class="note-date">${escapeHtml(formatDate(note.publishedAt))}</span>
                </div>

                <div class="public-note-card-body">
                    <h3><a class="public-note-seo-link" href="${escapeHtml(seoUrl)}">${escapeHtml(note.title || "Untitled note")}</a></h3>
                    ${collectionLabel ? `<p class="public-note-collection">${escapeHtml(collectionLabel)}</p>` : ""}
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

            const openCard = () => openPublicNote(note.noteId);
            card.querySelector(".public-note-seo-link")?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openCard();
            });
            card.querySelector("[data-contributor-id]")?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
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
                <div class="contributor-avatar" aria-hidden="true">${escapeHtml((contributor.displayName || "C").slice(0, 1).toUpperCase())}</div>
                <div class="contributor-profile-main">
                    <p class="eyebrow">Community contributor</p>
                    <h2>${escapeHtml(contributor.displayName || "Community member")}</h2>
                    <p>${Number(contributor.contributionCount || 0).toLocaleString()} published ${Number(contributor.contributionCount || 0) === 1 ? "note" : "notes"}</p>
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

    const url = new URL(window.location.href);
    url.searchParams.delete("note");
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
    try {
        const response = await authenticatedFetch(`/api/saved-notes/${encodeURIComponent(noteId)}`);
        const data = await response.json();
        if (!button.isConnected || button.dataset.noteId !== noteId) return;
        if (!response.ok) throw new Error(data.error || "Unable to check saved note.");
        saved = Boolean(data.saved);
    } catch (error) {
        if (!button.isConnected) return;
        button.textContent = "Try saved status again";
        button.disabled = false;
        feedback.textContent = "Saved status unavailable. Please retry.";
        button.addEventListener("click", () => initializeSaveButton(noteId), {once: true});
        return;
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

async function openPublicNote(noteId, updateUrl = true) {
    ++publicBrowseRequestVersion;
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
                <nav class="public-source-index" aria-label="Source files">
                    ${files.map((file, index) => {
                        const sourceId = `source-${escapeHtml(file.fileId || String(index + 1))}`;
                        return `
                            <a href="#${sourceId}" class="public-source-index-item">
                                <span>${index + 1}</span>
                                <strong>${escapeHtml(file.filename || `Source ${index + 1}`)}</strong>
                            </a>
                        `;
                    }).join("")}
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
                <div class="public-sources-heading">
                    <div>
                        <p class="eyebrow">Source material</p>
                        <h3>${files.length} source file${files.length === 1 ? "" : "s"}</h3>
                    </div>
                    ${files.length > 1 ? '<span class="status-text">Jump to a source below</span>' : ""}
                </div>

                ${sourceIndex}

                <div class="source-viewer-list">
                    ${files.length
                        ? files.map((file, index) => renderEmbeddedSource(file, index)).join("")
                        : '<p class="note-description">No source files are available for this note.</p>'}
                </div>
            </section>

            <section id="related-public-notes" class="related-public-section" data-note-id="${escapeHtml(note.noteId)}" aria-label="Related study notes" hidden></section>
        `;

        grid.hidden = true;
        document.querySelector(".explore-controls")?.setAttribute("hidden", "");
        document.getElementById("public-status").hidden = true;
        detail.hidden = false;
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
        document.getElementById("report-note-trigger")?.addEventListener("click", openReportNoteModal);
        document.getElementById("report-note-submit")?.addEventListener("click", () => submitPublicNoteReport(noteId));
        document.getElementById("report-note-close")?.addEventListener("click", closeReportNoteModal);
        document.getElementById("report-note-cancel")?.addEventListener("click", closeReportNoteModal);
        document.querySelector(".report-note-backdrop")?.addEventListener("click", closeReportNoteModal);
        await Promise.all([
            loadNativeExcelPreviews(noteId),
            loadNativePowerPointPreviews(noteId),
            loadNativeDocumentPreviews(noteId)
        ]);
    } catch (error) {
        detail.hidden = true;
        content.innerHTML = "";
        document.querySelector(".explore-controls")?.removeAttribute("hidden");
        grid.hidden = false;
        setPublicStatus(error.message || "Unable to open note.", true);
    }
}

window.addEventListener("focus", () => {
    if (!isAuthenticated()) {
        if (getAccessToken() || sessionStorage.getItem("id_token")) expireLocalSession();
        else renderSignedInState();
        return;
    }
    if (notesState.activeView === "my-notes") loadNotes();
    if (notesState.activeView === "saved-notes") loadSavedNotes();
});

document.addEventListener("DOMContentLoaded", async () => {
    renderSignedInState();
    await loadPublicTaxonomy();

    document.getElementById("hero-sign-in-btn").addEventListener("click", signIn);
    document.getElementById("my-notes-tab").addEventListener("click", () => setActiveView("my-notes"));
    document.getElementById("saved-notes-tab").addEventListener("click", () => setActiveView("saved-notes"));
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
    document.getElementById("public-search-btn").addEventListener("click", () => {
        notesState.publicPage = 1;
        loadPublicNotes();
    });
    document.getElementById("public-search-clear").addEventListener("click", () => {
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
            notesState.publicPage = 1;
            loadPublicNotes();
        }
    });
    document.getElementById("close-public-contributor").addEventListener("click", () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("contributor");
        window.history.replaceState({}, "", url);
        loadPublicNotes();
    });
    document.getElementById("close-public-note").addEventListener("click", () => {
        const url = new URL(window.location.href);
        url.searchParams.delete("note");
        window.history.replaceState({}, "", url);
        loadPublicNotes();
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

    const sharedParams = new URL(window.location.href).searchParams;
    const sharedNoteId = sharedParams.get("note");
    const sharedContributorId = sharedParams.get("contributor");
    if (sharedNoteId || sharedContributorId) {
        notesState.activeView = "explore";
        document.getElementById("my-notes-view").hidden = true;
        document.getElementById("settings-view").hidden = true;
        document.getElementById("analytics-view").hidden = true;
        document.getElementById("security-view").hidden = true;
        document.getElementById("explore-view").hidden = false;
        document.getElementById("saved-notes-view").hidden = true;
        document.getElementById("saved-notes-tab").classList.remove("active");
        document.getElementById("my-notes-tab").classList.remove("active");
        document.getElementById("settings-tab").classList.remove("active");
        document.getElementById("analytics-tab").classList.remove("active");
        document.getElementById("security-tab").classList.remove("active");
        document.getElementById("explore-tab").classList.add("active");
        document.getElementById("my-notes-tab").removeAttribute("aria-current");
        document.getElementById("explore-tab").setAttribute("aria-current", "page");
        if (sharedNoteId) await openPublicNote(sharedNoteId, false);
        else await openPublicContributor(sharedContributorId, false);
    }
});
