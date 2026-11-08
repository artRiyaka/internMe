(function () {
  "use strict";

  var DATA = window.InternMeData;
  if (!DATA) return;

  var STORAGE_KEY = "internme.mvp.v1";
  var CAP = 6;
  var VIEWS = ["home", "portal", "pricing", "about", "reel", "job"];
  var TITLES = {
    home: "InternMe",
    portal: "Portal",
    pricing: "Pricing",
    about: "About",
    reel: "Post a Reel",
    job: "Post a Job/Project"
  };

  var saved = loadSaved();
  var state = {
    view: "home",
    loggedIn: !!saved.loggedIn,
    customTalent: Array.isArray(saved.talent) ? saved.talent : [],
    customJobs: Array.isArray(saved.jobs) ? saved.jobs : [],
    applications: Array.isArray(saved.applications) ? saved.applications : [],
    filters: {
      talent: { zip: "", area: "", mode: "all" },
      jobs: { zip: "", area: "", mode: "all" }
    },
    quote: 0,
    portalTab: "talent",
    pendingSignup: null,
    justAdded: "",
    signatures: { talent: "", jobs: "" }
  };

  var quoteTimer = 0;
  var toastTimer = 0;
  var suppressScroll = false;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function loadSaved() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
    } catch (err) {
      return {};
    }
  }

  function persist() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      loggedIn: state.loggedIn,
      applications: state.applications,
      talent: state.customTalent,
      jobs: state.customJobs
    }));
  }

  function allTalent() {
    return state.customTalent.concat(DATA.talent);
  }

  function allJobs() {
    return state.customJobs.concat(DATA.jobs);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function videoIdOk(id) {
    return /^[\w-]{11}$/.test(id || "");
  }

  function parseYouTube(input) {
    var raw = (input || "").trim();
    if (!raw) return "";
    if (videoIdOk(raw)) return raw;
    var match = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/);
    return match ? match[1] : "";
  }

  function placeLine(item) {
    var mode = item.mode === "remote" ? "Remote" : "On-site";
    var bits = [];
    if (item.location) bits.push(item.location);
    if (item.area && item.area.toLowerCase() !== String(item.location || "").toLowerCase()) bits.push(item.area);
    if (item.zip) bits.push(item.zip);
    if (!bits.some(function (bit) { return bit.toLowerCase() === mode.toLowerCase(); })) bits.push(mode);
    return bits.join(" · ");
  }

  function matches(item, filters) {
    if (filters.mode === "remote" && item.mode !== "remote") return false;
    if (filters.mode === "onsite" && item.mode !== "onsite") return false;
    if (filters.zip && String(item.zip || "").indexOf(filters.zip) !== 0) return false;
    if (filters.area) {
      var hay = (item.location + " " + item.area).toLowerCase();
      if (hay.indexOf(filters.area.trim().toLowerCase()) === -1) return false;
    }
    return true;
  }

  function visible(list, filters) {
    var active = !!(filters.zip || filters.area || filters.mode !== "all");
    var rows = active ? list.filter(function (item) { return matches(item, filters); }) : list;
    return { total: rows.length, items: rows.slice(0, CAP), active: active };
  }

  function countCopy(result) {
    if (!result.active) return "2 × 3 featured";
    if (result.total === 0) return "No matches in this filter";
    if (result.total > CAP) return "Showing 6 of " + result.total + " · capped at 6";
    return result.total + (result.total === 1 ? " match" : " matches") + " · capped at 6";
  }

  function talentCard(person) {
    var chips = (person.skills || []).slice(0, 3).map(function (skill) {
      return "<li>" + esc(skill) + "</li>";
    }).join("");
    var vid = videoIdOk(person.videoId) ? person.videoId : DATA.videos[0].id;
    var fresh = person.id === state.justAdded ? " is-new" : "";
    return (
      '<article class="card' + fresh + '">' +
        '<button type="button" class="thumb" data-play="' + esc(person.id) + '" aria-label="Play 30-second reel from ' + esc(person.name) + '">' +
          '<img alt="" width="640" height="360" loading="lazy" decoding="async" src="https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg">' +
          '<span class="play" aria-hidden="true"></span>' +
          '<span class="time-badge">30s</span>' +
        "</button>" +
        "<div><h3>" + esc(person.name) + "</h3><p class=\"role\">" + esc(person.role) + "</p></div>" +
        '<p class="place">' + esc(placeLine(person)) + "</p>" +
        '<p class="blurb">' + esc(person.blurb) + "</p>" +
        (chips ? '<ul class="chips">' + chips + "</ul>" : "") +
      "</article>"
    );
  }

  function jobCard(job) {
    var applied = state.applications.indexOf(job.id) !== -1;
    var fresh = job.id === state.justAdded ? " is-new" : "";
    var stipend = job.stipend ? '<span class="pill">' + esc(job.stipend) + "</span>" : "";
    return (
      '<article class="card job-card' + fresh + '">' +
        '<div class="meta-row"><span class="pill">' + esc(job.duration) + "</span>" + stipend + "</div>" +
        "<div><h3>" + esc(job.title) + "</h3><p class=\"maker\">" + esc(job.maker) + "</p></div>" +
        '<p class="place">' + esc(placeLine(job)) + "</p>" +
        '<p class="blurb">' + esc(job.summary) + "</p>" +
        '<button type="button" class="btn ' + (applied ? "btn-done" : "btn-solid") + '" data-signup="' + esc(job.id) + '"' + (applied ? " disabled" : "") + ">" +
          (applied ? "Signed up" : "SignMeUp") +
        "</button>" +
      "</article>"
    );
  }

  function renderHero() {
    var person = allTalent()[0];
    var mount = document.getElementById("hero-preview");
    if (!person || !mount) return;
    var vid = videoIdOk(person.videoId) ? person.videoId : DATA.videos[0].id;
    mount.innerHTML =
      '<button type="button" class="spotlight" data-play="' + esc(person.id) + '" aria-label="Play 30-second reel from ' + esc(person.name) + '">' +
        '<div class="spotlight-media">' +
          '<img alt="" width="640" height="400" src="https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg">' +
          '<span class="play" aria-hidden="true"></span>' +
          '<span class="time-badge">30s</span>' +
        "</div>" +
        '<div class="spotlight-copy"><strong>' + esc(person.name) + "</strong><span>" + esc(person.role) + " · " + esc(placeLine(person)) + "</span></div>" +
      "</button>";
  }

  function renderGrids() {
    renderScope("talent", allTalent(), talentCard);
    renderScope("jobs", allJobs(), jobCard);
  }

  function renderScope(scope, list, template) {
    var result = visible(list, state.filters[scope]);
    var signature = result.items.map(function (item) { return item.id; }).join("|") + "::" + state.applications.join(",") + "::" + state.justAdded;
    var html = result.items.length
      ? result.items.map(template).join("")
      : '<div class="empty">Nothing in that zip or area yet. Clear the filter to see the six featured.</div>';
    if (state.signatures[scope] !== signature) {
      document.querySelectorAll('[data-grid="' + scope + '"]').forEach(function (grid) {
        grid.innerHTML = html;
      });
      state.signatures[scope] = signature;
    }
    document.querySelectorAll('[data-count="' + scope + '"]').forEach(function (line) {
      line.textContent = countCopy(result);
    });
  }

  function renderSignups() {
    var list = document.getElementById("signup-list");
    var empty = document.getElementById("signup-empty");
    var jobs = state.applications.map(function (id) {
      return allJobs().find(function (job) { return job.id === id; });
    }).filter(Boolean);
    list.innerHTML = jobs.map(function (job) {
      return "<li><strong>" + esc(job.title) + "</strong> <span>" + esc(job.maker) + " · " + esc(job.duration) + "</span></li>";
    }).join("");
    empty.hidden = jobs.length > 0;
    document.querySelectorAll("[data-signup-count]").forEach(function (badge) {
      badge.hidden = jobs.length === 0;
      badge.textContent = String(jobs.length);
    });
  }

  function renderBanner() {
    var banner = document.getElementById("auth-banner");
    banner.textContent = state.loggedIn
      ? "You're in. SignMeUp is live on project cards."
      : "Browsing is open. Log in to SignMeUp.";
  }

  function renderChrome() {
    var login = document.getElementById("login-toggle");
    login.textContent = state.loggedIn ? "Log out" : "Log in";
    document.querySelectorAll("[data-viewlink]").forEach(function (link) {
      var on = link.dataset.viewlink === state.view;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    renderBanner();
  }

  function renderPortalTab() {
    document.querySelectorAll("[data-tab]").forEach(function (tab) {
      var on = tab.dataset.tab === state.portalTab;
      tab.classList.toggle("is-on", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== state.portalTab;
    });
  }

  function renderCarousel() {
    var item = DATA.testimonials[state.quote];
    document.querySelector(".carousel-quote").textContent = item.quote;
    document.querySelector(".carousel-by").textContent = item.by;
    document.querySelectorAll(".dot").forEach(function (dot, index) {
      var on = index === state.quote;
      dot.classList.toggle("is-on", on);
      dot.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function buildDots() {
    var mount = document.querySelector(".dots");
    mount.innerHTML = DATA.testimonials.map(function (_, index) {
      return '<button type="button" class="dot" role="tab" data-dot="' + index + '" aria-label="Testimonial ' + (index + 1) + '"></button>';
    }).join("");
  }

  function fillVideoSelect() {
    var select = document.getElementById("reel-video");
    select.innerHTML = DATA.videos.map(function (video) {
      return '<option value="' + video.id + '">' + esc(video.label) + "</option>";
    }).join("");
  }

  function viewFromHash() {
    var hash = location.hash || "";
    if (!hash || hash === "#" || hash === "#/" || hash === "#/home") return "home";
    if (hash.indexOf("#/") !== 0) return state.view || "home";
    var raw = hash.slice(2);
    return VIEWS.indexOf(raw) !== -1 ? raw : "home";
  }

  function setView(view, opts) {
    opts = opts || {};
    if (VIEWS.indexOf(view) === -1) view = "home";
    var previous = state.view;
    state.view = view;
    document.querySelectorAll("[data-view]").forEach(function (section) {
      section.hidden = section.dataset.view !== view;
    });
    var next = view === "home" ? "#/" : "#/" + view;
    if (!opts.fromHash && location.hash !== next) {
      if (opts.scroll === false) suppressScroll = true;
      location.hash = next;
    }
    renderChrome();
    document.title = TITLES[view] + (view === "home" ? "" : " · InternMe");
    var toTop = opts.scroll !== false && previous !== view;
    if (opts.fromHash && (location.hash === "#/" || location.hash === "")) toTop = previous !== view || opts.scroll !== false;
    if (opts.scroll === false) toTop = false;
    if (opts.fromHash && suppressScroll) {
      suppressScroll = false;
      toTop = false;
    }
    if (toTop) window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  function syncFilters() {
    ["talent", "jobs"].forEach(function (scope) {
      ["zip", "area", "mode"].forEach(function (field) {
        document.querySelectorAll('[data-scope="' + scope + '"][data-field="' + field + '"]').forEach(function (input) {
          input.value = state.filters[scope][field];
        });
      });
    });
  }

  function toast(message) {
    var node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("is-on"); }, 3200);
  }

  function openLogin() {
    var dialog = document.getElementById("login-dialog");
    if (!dialog.open) dialog.showModal();
    document.getElementById("login-submit").focus();
  }

  function completeLogin() {
    state.loggedIn = true;
    persist();
    var dialog = document.getElementById("login-dialog");
    if (dialog.open) dialog.close();
    var pending = state.pendingSignup;
    state.pendingSignup = null;
    if (pending) {
      addSignup(pending, true);
      state.portalTab = "jobs";
      renderPortalTab();
      toast("You're in. Signed up.");
    } else {
      toast("You're in.");
    }
    renderChrome();
    renderGrids();
    renderSignups();
    setView("portal");
  }

  function addSignup(id, quiet) {
    if (state.applications.indexOf(id) !== -1) return;
    var job = allJobs().find(function (item) { return item.id === id; });
    if (!job) return;
    state.applications.push(id);
    persist();
    state.signatures.jobs = "";
    renderGrids();
    renderSignups();
    if (!quiet) toast("Signed up for " + job.title + ".");
  }

  function onSignup(id) {
    if (state.applications.indexOf(id) !== -1) return;
    if (!state.loggedIn) {
      state.pendingSignup = id;
      openLogin();
      return;
    }
    addSignup(id, false);
  }

  function openVideo(id) {
    var person = allTalent().find(function (item) { return item.id === id; });
    if (!person || !videoIdOk(person.videoId)) return;
    document.getElementById("video-title").textContent = person.name;
    document.getElementById("video-role").textContent = person.role + " · 30-second pitch";
    document.getElementById("video-frame").src = "https://www.youtube-nocookie.com/embed/" + person.videoId + "?rel=0&modestbranding=1";
    var dialog = document.getElementById("video-dialog");
    if (!dialog.open) dialog.showModal();
  }

  function closeVideo() {
    var dialog = document.getElementById("video-dialog");
    document.getElementById("video-frame").src = "";
    if (dialog.open) dialog.close();
  }

  function showError(id, message) {
    var node = document.getElementById(id);
    node.hidden = !message;
    node.textContent = message || "";
  }

  function fieldValue(form, name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function requireZip(mode, zip) {
    if (mode === "onsite" && !/^\d{5}$/.test(zip)) return "Add a 5-digit zip for on-site work.";
    if (zip && !/^\d{5}$/.test(zip)) return "Use a 5-digit zip, or leave it blank for remote.";
    return "";
  }

  function publishReel(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var name = fieldValue(form, "name");
    var role = fieldValue(form, "role");
    var area = fieldValue(form, "area");
    var zip = fieldValue(form, "zip").replace(/\D/g, "").slice(0, 5);
    var mode = fieldValue(form, "mode") || "onsite";
    var blurb = fieldValue(form, "blurb");
    var linked = parseYouTube(fieldValue(form, "link"));
    var selected = fieldValue(form, "video");
    var error = "";
    if (name.length < 2) error = "Add a name.";
    else if (!role) error = "Add a role.";
    else if (!area) error = "Add a city or area.";
    else if (!blurb) error = "Add a short pitch.";
    else error = requireZip(mode, zip);
    if (!error && fieldValue(form, "link") && !linked) error = "That YouTube link did not parse. Keep the selected demo, or paste a full link.";
    showError("reel-error", error);
    if (error) return;
    var videoId = linked || (videoIdOk(selected) ? selected : DATA.videos[0].id);
    var reel = {
      id: "reel-" + Date.now(),
      name: name,
      role: role,
      location: area,
      area: area,
      zip: zip,
      mode: mode,
      skills: fieldValue(form, "skills").split(",").map(function (skill) { return skill.trim(); }).filter(Boolean).slice(0, 3),
      blurb: blurb,
      videoId: videoId
    };
    state.customTalent.unshift(reel);
    state.justAdded = reel.id;
    state.filters.talent = { zip: "", area: "", mode: "all" };
    persist();
    form.reset();
    syncFilters();
    state.signatures.talent = "";
    renderHero();
    renderGrids();
    toast(name.split(" ")[0] + " is on the featured grid.");
    if (state.loggedIn) {
      state.portalTab = "talent";
      renderPortalTab();
      setView("portal");
    } else {
      setView("home", { scroll: false });
      var section = document.getElementById("featured-talent");
      if (section) section.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function publishJob(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var title = fieldValue(form, "title");
    var maker = fieldValue(form, "maker");
    var area = fieldValue(form, "area");
    var zip = fieldValue(form, "zip").replace(/\D/g, "").slice(0, 5);
    var mode = fieldValue(form, "mode") || "onsite";
    var duration = fieldValue(form, "duration");
    var summary = fieldValue(form, "summary");
    var error = "";
    if (!title) error = "Add a project title.";
    else if (!maker) error = "Add the studio or maker.";
    else if (!area) error = "Add a city or area.";
    else if (!duration) error = "Add a length, such as 4 weeks.";
    else if (!summary) error = "Add what they will ship.";
    else error = requireZip(mode, zip);
    showError("job-error", error);
    if (error) return;
    var job = {
      id: "job-" + Date.now(),
      title: title,
      maker: maker,
      location: area,
      area: area,
      zip: zip,
      mode: mode,
      duration: duration,
      stipend: fieldValue(form, "stipend"),
      summary: summary
    };
    state.customJobs.unshift(job);
    state.justAdded = job.id;
    state.filters.jobs = { zip: "", area: "", mode: "all" };
    persist();
    form.reset();
    syncFilters();
    state.signatures.jobs = "";
    renderGrids();
    toast(title + " is on the featured grid.");
    if (state.loggedIn) {
      state.portalTab = "jobs";
      renderPortalTab();
      setView("portal");
    } else {
      setView("home", { scroll: false });
      var section = document.getElementById("featured-jobs");
      if (section) section.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function stepQuote(direction) {
    var slide = document.querySelector(".carousel-slide");
    var apply = function () {
      var total = DATA.testimonials.length;
      state.quote = (state.quote + direction + total) % total;
      renderCarousel();
      slide.classList.remove("is-out");
    };
    if (reducedMotion) {
      apply();
      return;
    }
    slide.classList.add("is-out");
    setTimeout(apply, 160);
  }

  function startQuotes() {
    stopQuotes();
    if (reducedMotion) return;
    quoteTimer = setInterval(function () { stepQuote(1); }, 7000);
  }

  function stopQuotes() {
    clearInterval(quoteTimer);
  }

  function bindBackdrop(dialog, onClose) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
        if (onClose) onClose();
      }
    });
  }

  function onFilterEvent(event) {
    var input = event.target.closest("[data-field]");
    if (!input) return;
    var scope = input.dataset.scope;
    var field = input.dataset.field;
    var value = input.value;
    if (field === "zip") {
      value = value.replace(/\D/g, "").slice(0, 5);
      input.value = value;
    }
    state.filters[scope][field] = value;
    document.querySelectorAll('[data-scope="' + scope + '"][data-field="' + field + '"]').forEach(function (other) {
      if (other !== input) other.value = value;
    });
    state.signatures[scope] = "";
    renderScope(scope, scope === "talent" ? allTalent() : allJobs(), scope === "talent" ? talentCard : jobCard);
  }

  document.addEventListener("click", function (event) {
    var play = event.target.closest("[data-play]");
    if (play) {
      openVideo(play.dataset.play);
      return;
    }
    var signup = event.target.closest("[data-signup]");
    if (signup) {
      onSignup(signup.dataset.signup);
      return;
    }
    var clear = event.target.closest("[data-clear]");
    if (clear) {
      var scope = clear.dataset.clear;
      state.filters[scope] = { zip: "", area: "", mode: "all" };
      syncFilters();
      state.signatures[scope] = "";
      renderScope(scope, scope === "talent" ? allTalent() : allJobs(), scope === "talent" ? talentCard : jobCard);
      return;
    }
    var tab = event.target.closest("[data-tab]");
    if (tab) {
      state.portalTab = tab.dataset.tab;
      renderPortalTab();
      return;
    }
    if (event.target.closest("[data-quote]")) {
      stepQuote(Number(event.target.closest("[data-quote]").dataset.quote));
      return;
    }
    var dot = event.target.closest("[data-dot]");
    if (dot) {
      var next = Number(dot.dataset.dot) - state.quote;
      if (next) stepQuote(next);
    }
  });

  document.addEventListener("input", onFilterEvent);
  document.addEventListener("change", onFilterEvent);

  document.querySelectorAll(".filters").forEach(function (form) {
    form.addEventListener("submit", function (event) { event.preventDefault(); });
  });

  document.getElementById("login-toggle").addEventListener("click", function () {
    if (state.loggedIn) {
      state.loggedIn = false;
      state.pendingSignup = null;
      persist();
      renderChrome();
      toast("Logged out.");
      setView("home");
      return;
    }
    openLogin();
  });

  document.getElementById("login-form").addEventListener("submit", function (event) {
    event.preventDefault();
    completeLogin();
  });
  document.getElementById("login-cancel").addEventListener("click", function () {
    state.pendingSignup = null;
    document.getElementById("login-dialog").close();
  });
  document.getElementById("video-close").addEventListener("click", closeVideo);
  document.getElementById("video-dialog").addEventListener("close", function () {
    document.getElementById("video-frame").src = "";
  });
  bindBackdrop(document.getElementById("login-dialog"));
  bindBackdrop(document.getElementById("video-dialog"), closeVideo);

  document.getElementById("reel-form").addEventListener("submit", publishReel);
  document.getElementById("job-form").addEventListener("submit", publishJob);

  var carousel = document.querySelector(".carousel");
  carousel.addEventListener("mouseenter", stopQuotes);
  carousel.addEventListener("mouseleave", startQuotes);
  carousel.addEventListener("focusin", stopQuotes);
  carousel.addEventListener("focusout", startQuotes);

  window.addEventListener("hashchange", function () {
    var hash = location.hash || "";
    if (hash && hash !== "#/" && hash.indexOf("#/") !== 0) return;
    setView(viewFromHash(), { fromHash: true });
  });

  window.addEventListener("scroll", function () {
    document.querySelector(".site-header").classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  buildDots();
  fillVideoSelect();
  renderHero();
  renderGrids();
  renderSignups();
  renderPortalTab();
  renderCarousel();
  startQuotes();
  setView(viewFromHash(), { fromHash: true, scroll: false });
})();
