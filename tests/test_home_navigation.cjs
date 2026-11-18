"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("notes.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const section = (start, end) => {
    const a = source.indexOf(start);
    const b = source.indexOf(end, a);
    assert(a >= 0 && b > a, "Missing navigation helper: " + start);
    return source.slice(a, b);
};
const nodes = new Map();
function element(id) {
    if (!nodes.has(id)) {
        const attributes = new Map();
        const classes = new Set();
        nodes.set(id, {
            hidden: false,
            classList: {
                toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            setAttribute(name, value) { attributes.set(name, value); },
            removeAttribute(name) { attributes.delete(name); },
            getAttribute(name) { return attributes.get(name) ?? null; }
        });
    }
    return nodes.get(id);
}
const state = {
    activeView: "home", navigationVersion: 0, lastAdminView: "analytics", homeLoadVersion: 0, isAdmin: true
};
const calls = {home:0, featured:0, explore:0, saved:0};
let token = "member-token";
let authenticated = true;
const ctx = {
    notesState: state,
    document: {getElementById:element},
    isAuthenticated:() => authenticated,
    isConfiguredAdmin:() => true,
    getAccessToken:() => token,
    exitPublicReaderFocus:() => {},
    loadHomeDashboard:() => {calls.home++;},
    loadFeaturedHome:() => {calls.featured++;},
    loadPublicNotes:() => {calls.explore++;},
    loadSavedNotes:() => {calls.saved++;},
    loadStudyDashboard:() => {},
    loadAdminAnalytics:() => {},
    loadAdminSecurity:() => {},
    loadAdminModeration:() => {},
    loadAdminFeedback:() => {}
};
vm.createContext(ctx);
vm.runInContext(section('const ADMIN_VIEWS = ', 'function isConfiguredAdmin()'), ctx);
vm.runInContext(section('function homeRequestCurrent(', 'function homeMessage('), ctx);

ctx.setActiveView("analytics");
const analyticsRequest = state.navigationVersion;
assert.equal(ctx.isCurrentAdminView("analytics", analyticsRequest), true);
ctx.setActiveView("saved-notes");
assert.equal(state.activeView, "saved-notes");
assert.equal(element("saved-notes-view").hidden, false);
assert.equal(ctx.isCurrentAdminView("analytics", analyticsRequest), false, "stale admin response must not apply");
ctx.setActiveView("home");
const homeRequest = ++state.homeLoadVersion;
assert.equal(ctx.homeRequestCurrent(homeRequest, token), true);
assert.equal(calls.home, 1);
ctx.setActiveView("explore", {skipExploreLoad:true});
assert.equal(state.activeView, "explore");
assert.equal(calls.explore, 0, "direct reader entry must not start an Explore grid fetch");
assert.equal(ctx.homeRequestCurrent(homeRequest, token), false, "old Home results must not show after navigation");
ctx.setActiveView("explore");
assert.equal(calls.explore, 1);
ctx.setActiveView("home");
const newerRequest = ++state.homeLoadVersion;
token = "different-user";
assert.equal(ctx.homeRequestCurrent(newerRequest, "member-token"), false, "account switch invalidates pending Home response");
authenticated = false;
state.isAdmin = false;
ctx.setActiveView("security");
assert.equal(state.activeView, "home", "non-admin cannot enter an admin view");

for (const id of ["home-continue-list","home-saved-list","home-trending-list","home-study-all","home-saved-all","home-trending-all"]) {
    assert(html.includes('id="' + id + '"'), "Missing Home dashboard target " + id);
}
console.log("Navigation and Home regression assertions passed.");
