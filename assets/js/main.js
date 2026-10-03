/* ==========================================================================
   Librairie Tawbah — script principal
   Vanilla JS, sans dépendance. Amélioration progressive :
   le site reste utilisable et lisible si ce fichier ne se charge pas.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 0. Forçage HTTPS (filet de sécurité côté client) ----------
     La redirection principale est faite par le serveur (.htaccess / nginx).
     Ce garde-fou couvre le cas d'un lien http:// ouvert malgré tout.        */
  var host = location.hostname;
  var isPrivateIp = /^(10\.|127\.|169\.254\.|192\.168\.)/.test(host) ||
                     /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  var isLocal = host === "localhost" || host === "" || host.endsWith(".local") ||
                location.protocol === "file:" || isPrivateIp;
  if (location.protocol === "http:" && !isLocal) {
    location.replace("https://" + host + location.pathname + location.search + location.hash);
    return;
  }

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var euro = function (n) { return n.toFixed(2).replace(".", ",") + " €"; };

  /* ---------- 1. Année courante ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- 2. Ombre du header au scroll ---------- */
  var header = $(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-stuck", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------- 3. Overlay partagé ---------- */
  var overlay = $("#overlay");
  var closeAllPanels = function () {
    var nav = $("#primary-nav");
    if (nav) nav.classList.remove("is-open");
    var burger = $("#burger");
    if (burger) burger.setAttribute("aria-expanded", "false");
    var drawer = $("#cart-drawer");
    if (drawer) { drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); }
    if (overlay) overlay.classList.remove("is-open");
    document.body.style.overflow = "";
  };
  if (overlay) overlay.addEventListener("click", closeAllPanels);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAllPanels(); });

  /* ---------- 4. Navigation mobile ---------- */
  var burger = $("#burger");
  var nav = $("#primary-nav");
  if (burger && nav) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
      if (overlay) overlay.classList.toggle("is-open", open);
      document.body.style.overflow = open ? "hidden" : "";
      if (open) { var first = $("a, button", nav); if (first) first.focus(); }
    });
  }
  var navClose = $("#nav-close");
  if (navClose) navClose.addEventListener("click", function () { closeAllPanels(); if (burger) burger.focus(); });

  /* ---------- 5. Méga-menu (survol au pointeur, clic/clavier partout) ---------- */
  $$(".nav__item--has-menu").forEach(function (item) {
    var trigger = $(".nav__link", item);
    if (!trigger) return;
    var setOpen = function (state) {
      item.setAttribute("data-open", String(state));
      trigger.setAttribute("aria-expanded", String(state));
    };
    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      var willOpen = item.getAttribute("data-open") !== "true";
      $$(".nav__item--has-menu").forEach(function (o) { if (o !== item) o.setAttribute("data-open", "false"); });
      setOpen(willOpen);
    });
    if (window.matchMedia("(hover: hover) and (min-width: 1041px)").matches) {
      item.addEventListener("mouseenter", function () { setOpen(true); });
      item.addEventListener("mouseleave", function () { setOpen(false); });
    }
    item.addEventListener("focusout", function (e) {
      if (!item.contains(e.relatedTarget)) setOpen(false);
    });
  });

  /* ---------- 6. Recherche ---------- */
  var searchToggle = $("#search-toggle");
  var searchBar = $("#search-bar");
  if (searchToggle && searchBar) {
    searchToggle.addEventListener("click", function () {
      var open = searchBar.classList.toggle("is-open");
      searchToggle.setAttribute("aria-expanded", String(open));
      if (open) { var input = $("input", searchBar); if (input) input.focus(); }
    });
  }
  // Recherche locale : filtre la grille si on est sur une page catalogue,
  // sinon renvoie vers la page Vêtements avec le terme en paramètre.
  var searchForm = $("#search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", function (e) {
      var term = ($("input", searchForm) || {}).value || "";
      if ($("#product-grid")) {
        e.preventDefault();
        state.search = term.trim().toLowerCase();
        applyFilters();
        var grid = $("#product-grid");
        if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        searchForm.action = searchForm.getAttribute("data-action") || "vetements.html";
      }
    });
  }

  /* ---------- 7. Révélation au scroll ---------- */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealables = $$("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealables.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 8. Accordéons ---------- */
  $$(".accordion__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      if (panel) panel.setAttribute("data-open", String(!expanded));
    });
  });

  /* ---------- 9. Filtres + tri du catalogue ---------- */
  var grid = $("#product-grid");
  var state = { search: "", filters: {} };

  function readProduct(card) {
    return {
      el: card,
      price: parseFloat(card.getAttribute("data-price") || "0"),
      name: (card.getAttribute("data-name") || "").toLowerCase(),
      keywords: (card.getAttribute("data-keywords") || "").toLowerCase(),
      date: parseInt(card.getAttribute("data-order") || "0", 10)
    };
  }

  function matches(card) {
    var ok = true;
    Object.keys(state.filters).forEach(function (key) {
      var wanted = state.filters[key];
      if (!wanted.length) return;
      var values = (card.getAttribute("data-" + key) || "").split("|");
      var hit = wanted.some(function (w) { return values.indexOf(w) !== -1; });
      if (!hit) ok = false;
    });
    if (ok && state.search) {
      var hay = (card.getAttribute("data-name") + " " + (card.getAttribute("data-keywords") || "")).toLowerCase();
      if (hay.indexOf(state.search) === -1) ok = false;
    }
    return ok;
  }

  function applyFilters() {
    if (!grid) return;
    var cards = $$(".product", grid);
    var visible = 0;
    cards.forEach(function (card) {
      var show = matches(card);
      card.hidden = !show;
      if (show) visible++;
    });
    var count = $("#result-count");
    if (count) count.textContent = String(visible);
    var empty = $("#grid-empty");
    if (empty) empty.hidden = visible !== 0;
    var chips = $("#active-filters");
    if (chips) {
      var total = Object.keys(state.filters).reduce(function (n, k) { return n + state.filters[k].length; }, 0);
      chips.hidden = total === 0 && !state.search;
    }
  }

  $$("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-filter");
      var value = btn.getAttribute("data-value");
      state.filters[key] = state.filters[key] || [];
      var idx = state.filters[key].indexOf(value);
      if (idx === -1) { state.filters[key].push(value); btn.setAttribute("aria-pressed", "true"); }
      else { state.filters[key].splice(idx, 1); btn.setAttribute("aria-pressed", "false"); }
      applyFilters();
    });
  });

  var reset = $("#filters-reset");
  if (reset) {
    reset.addEventListener("click", function () {
      state.filters = {}; state.search = "";
      $$("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      applyFilters();
    });
  }

  var filtersToggle = $("#filters-toggle");
  if (filtersToggle) {
    filtersToggle.addEventListener("click", function () {
      var panel = $("#filters");
      if (!panel) return;
      var open = panel.classList.toggle("is-open");
      filtersToggle.setAttribute("aria-expanded", String(open));
    });
  }

  var sort = $("#sort");
  if (sort && grid) {
    sort.addEventListener("change", function () {
      var cards = $$(".product", grid).map(readProduct);
      var mode = sort.value;
      cards.sort(function (a, b) {
        if (mode === "price-asc") return a.price - b.price;
        if (mode === "price-desc") return b.price - a.price;
        if (mode === "name") return a.name.localeCompare(b.name, "fr");
        return b.date - a.date; // nouveautés
      });
      var frag = document.createDocumentFragment();
      cards.forEach(function (c) { frag.appendChild(c.el); });
      grid.appendChild(frag);
    });
  }

  // Paramètre ?q= dans l'URL (venant de la recherche d'une autre page)
  var params = new URLSearchParams(location.search);
  if (params.get("q") && grid) {
    state.search = params.get("q").toLowerCase();
    var si = $("#search-input");
    if (si) si.value = params.get("q");
    applyFilters();
  }
  // Paramètre ?cat= (lien direct depuis le menu)
  if (params.get("cat") && grid) {
    var catBtn = $('[data-filter="cat"][data-value="' + CSS.escape(params.get("cat")) + '"]');
    if (catBtn) catBtn.click();
  }

  /* ---------- 10. Favoris ---------- */
  var FAV_KEY = "tawbah_favoris";
  function readStore(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* mode privé */ }
  }
  var favs = readStore(FAV_KEY);
  $$(".product__fav").forEach(function (btn) {
    var id = btn.getAttribute("data-id");
    if (favs.indexOf(id) !== -1) btn.setAttribute("aria-pressed", "true");
    btn.addEventListener("click", function () {
      var on = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", String(!on));
      favs = readStore(FAV_KEY);
      if (on) { favs = favs.filter(function (f) { return f !== id; }); }
      else if (favs.indexOf(id) === -1) { favs.push(id); }
      writeStore(FAV_KEY, favs);
      toast(on ? "Retiré de vos favoris" : "Ajouté à vos favoris");
    });
  });

  /* ---------- 11. Panier ---------- */
  var CART_KEY = "tawbah_panier";
  var cart = readStore(CART_KEY);
  if (!Array.isArray(cart)) cart = [];

  var drawer = $("#cart-drawer");
  var cartBody = $("#cart-body");
  var cartFoot = $("#cart-foot");
  var cartTotalEl = $("#cart-total");
  var cartCount = $("#cart-count");

  function saveCart() { writeStore(CART_KEY, cart); renderCart(); }

  function cartQty() { return cart.reduce(function (n, l) { return n + l.qty; }, 0); }
  function cartTotal() { return cart.reduce(function (n, l) { return n + l.price * l.qty; }, 0); }

  function renderCart() {
    var qty = cartQty();
    if (cartCount) { cartCount.textContent = String(qty); cartCount.hidden = qty === 0; }
    if (!cartBody) return;

    if (!cart.length) {
      cartBody.innerHTML =
        '<div class="cart-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></svg>' +
        '<p>Votre panier est vide.</p>' +
        '<p><a class="link-arrow" href="vetements.html">Découvrir les vêtements</a></p>' +
        '</div>';
      if (cartFoot) cartFoot.hidden = true;
      return;
    }

    if (cartFoot) cartFoot.hidden = false;
    cartBody.innerHTML = cart.map(function (line, i) {
      return '<article class="cart-line">' +
        '<img src="' + line.img + '" alt="" loading="lazy" width="72" height="96">' +
        '<div><h3>' + line.name + '</h3>' +
        '<p>Quantité : ' + line.qty + (line.variant ? " · " + line.variant : "") + '</p>' +
        '<button class="cart-line__remove" type="button" data-remove="' + i + '">Retirer</button></div>' +
        '<div class="cart-line__price">' + euro(line.price * line.qty) + '</div>' +
        '</article>';
    }).join("");

    if (cartTotalEl) cartTotalEl.textContent = euro(cartTotal());

    $$("[data-remove]", cartBody).forEach(function (btn) {
      btn.addEventListener("click", function () {
        cart.splice(parseInt(btn.getAttribute("data-remove"), 10), 1);
        saveCart();
        toast("Article retiré du panier");
      });
    });
  }

  function openCart() {
    if (!drawer) return;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    if (overlay) overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    var close = $("#cart-close");
    if (close) close.focus();
  }

  $$("#cart-toggle, [data-open-cart]").forEach(function (btn) {
    btn.addEventListener("click", function (e) { e.preventDefault(); openCart(); });
  });
  var cartClose = $("#cart-close");
  if (cartClose) cartClose.addEventListener("click", closeAllPanels);

  function addToCart(data) {
    var existing = cart.filter(function (l) { return l.id === data.id && l.variant === data.variant; })[0];
    if (existing) existing.qty += data.qty;
    else cart.push(data);
    saveCart();
    toast(data.name + " ajouté au panier");
    openCart();
  }

  $$("[data-add-to-cart]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var card = btn.closest("[data-id]") || btn;
      var qtyInput = $("#qty");
      var variantBtn = $('[data-variant][aria-pressed="true"]');
      addToCart({
        id: card.getAttribute("data-id"),
        name: card.getAttribute("data-name"),
        price: parseFloat(card.getAttribute("data-price") || "0"),
        img: card.getAttribute("data-img") || "assets/img/placeholder.svg",
        variant: variantBtn ? variantBtn.getAttribute("data-variant") : "",
        qty: qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1
      });
    });
  });

  renderCart();

  /* ---------- 12. Sélecteurs de variante + quantité (fiche produit) ---------- */
  $$("[data-variant]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var group = btn.parentElement;
      $$("[data-variant]", group).forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
      btn.setAttribute("aria-pressed", "true");
    });
  });
  var qtyInput = $("#qty");
  if (qtyInput) {
    $$("[data-qty]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var step = parseInt(btn.getAttribute("data-qty"), 10);
        qtyInput.value = String(Math.max(1, (parseInt(qtyInput.value, 10) || 1) + step));
      });
    });
  }
  // Galerie fiche produit
  $$(".pdp__thumbs button").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var main = $("#pdp-main-img");
      var img = $("img", btn);
      if (main && img) main.src = img.src;
      $$(".pdp__thumbs button").forEach(function (b) { b.setAttribute("aria-current", "false"); });
      btn.setAttribute("aria-current", "true");
    });
  });

  /* ---------- 13. Toast ---------- */
  var toastEl = $("#toast");
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    $("#toast-text").textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 3200);
  }

  /* ---------- 14. Formulaires (validation côté client) ----------
     Les formulaires pointent vers un service d'envoi (à configurer :
     voir README). En l'absence d'action, on affiche un message de succès
     local pour ne pas laisser l'utilisateur sans retour.                   */
  $$("form[data-validate]").forEach(function (form) {
    form.setAttribute("novalidate", "novalidate");
    form.addEventListener("submit", function (e) {
      var valid = true;
      $$("[required]", form).forEach(function (input) {
        var field = input.closest(".field") || input.closest(".checkbox");
        var error = field ? $(".field__error", field) : null;
        var ok = input.type === "checkbox" ? input.checked : input.checkValidity() && input.value.trim() !== "";
        if (field) field.classList.toggle("field--error", !ok);
        if (error) error.hidden = ok;
        if (!ok && valid && input.focus) input.focus();
        if (!ok) valid = false;
      });
      if (!valid) { e.preventDefault(); return; }
      if (!form.getAttribute("action")) {
        e.preventDefault();
        var success = $(".form__success", form) || $("#" + form.getAttribute("data-success"));
        if (success) { success.hidden = false; success.setAttribute("tabindex", "-1"); success.focus(); }
        form.reset();
        toast("Message enregistré — nous vous répondons sous 24 h ouvrées.");
      }
    });
  });
})();
