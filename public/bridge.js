/*!
 * DesignParity.app live-preview bridge.
 *
 * Add to the site you're reviewing:
 *   <script src="https://www.designparity.app/bridge.js" async></script>
 *
 * It does nothing unless the page is framed by the DesignParity.app origin
 * this script was loaded from. When it is, it reports element positions and
 * hover/click targets to that window only, so reviewers can pin real
 * elements. Protocol: src/lib/live/protocol.ts — keep the two in step.
 *
 * The live-preview proxy (live-proxy/) adds this script to every page it
 * serves, marked with the site's real origin so URLs are reported as the
 * real site's rather than the proxy's.
 */
(function () {
  "use strict";

  if (window.parent === window || window.__designParityBridge) return;
  var script = document.currentScript;
  if (!script || !script.src) return;
  window.__designParityBridge = true;

  var APP_ORIGIN = new URL(script.src, location.href).origin;
  var APP = "designparity-app";
  var BRIDGE = "designparity-bridge";
  var VERSION = 1;
  var TEST_ATTRS = ["data-testid", "data-test", "data-cy", "data-qa"];
  var BLOCKED_EVENTS = [
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "submit",
  ];

  var proxied = document.querySelector("script[data-dp-real-origin]");
  var REAL_ORIGIN = proxied ? proxied.getAttribute("data-dp-real-origin") : null;

  var mode = "browse";
  var pins = [];
  var resolved = {};
  var hoverEl = null;
  var frame = 0;
  var resolveTimer = 0;
  var lastLayout = "";
  var cursorStyle = null;

  function post(message) {
    message.source = BRIDGE;
    // targetOrigin pins delivery to the app — if anything else frames the
    // page, the browser drops the message instead of leaking it.
    window.parent.postMessage(message, APP_ORIGIN);
  }

  function pageUrl() {
    return REAL_ORIGIN ? REAL_ORIGIN + location.href.slice(location.origin.length) : location.href;
  }

  function textOf(el) {
    return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function isStableId(id) {
    // Skip ids frameworks generate per render (React useId, Radix, Headless UI…)
    return (
      /^[A-Za-z][\w-]*$/.test(id) &&
      !/\d{3,}/.test(id) &&
      !/^(radix|headlessui|react|mui|ember|ng-|_r_|r[0-9])/i.test(id)
    );
  }

  function isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function selectorFor(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      if (node.id && isStableId(node.id) && isUnique("#" + CSS.escape(node.id))) {
        parts.unshift("#" + CSS.escape(node.id));
        return parts.join(" > ");
      }
      var tag = node.tagName.toLowerCase();
      for (var i = 0; i < TEST_ATTRS.length; i++) {
        var value = node.getAttribute(TEST_ATTRS[i]);
        if (value) {
          var attrSelector = tag + "[" + TEST_ATTRS[i] + '="' + CSS.escape(value) + '"]';
          if (isUnique(attrSelector)) {
            parts.unshift(attrSelector);
            return parts.join(" > ");
          }
        }
      }
      if (node === document.body) {
        parts.unshift("body");
        break;
      }
      var parent = node.parentElement;
      if (parent) {
        var sameTag = [];
        for (var c = 0; c < parent.children.length; c++) {
          if (parent.children[c].tagName === node.tagName) sameTag.push(parent.children[c]);
        }
        if (sameTag.length > 1) tag += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
      }
      parts.unshift(tag);
      node = parent;
    }
    return parts.join(" > ");
  }

  function labelFor(el) {
    var label = el.tagName.toLowerCase();
    if (el.id) return label + "#" + el.id;
    var classes = typeof el.className === "string" ? el.className.trim().split(/\s+/) : [];
    if (classes[0]) label += "." + classes.slice(0, 2).join(".");
    return label;
  }

  function rectOf(r) {
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  // Selector and text are only worth their cost for a pick; hover runs every frame.
  function describe(el, full) {
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    return {
      selector: full ? selectorFor(el) : "",
      tag: el.tagName.toLowerCase(),
      text: full ? textOf(el) : "",
      label: labelFor(el),
      rect: rectOf(r),
      docRect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height },
      styles: {
        fontFamily: s.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        color: s.color,
        backgroundColor: s.backgroundColor,
        padding: s.padding,
        borderRadius: s.borderRadius,
      },
    };
  }

  function tagFromSelector(selector) {
    var last = selector.split(">").pop().trim();
    var match = /^[a-z][a-z0-9-]*/.exec(last);
    return match ? match[0] : "*";
  }

  function findByText(tag, text) {
    var candidates = document.body.getElementsByTagName(tag);
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < candidates.length && i < 5000; i++) {
      var el = candidates[i];
      if (textOf(el) !== text) continue;
      var r = el.getBoundingClientRect();
      var area = r.width * r.height;
      // the innermost box with that text, not a wrapper that only holds it
      if (area > 0 && area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best;
  }

  // Selector first; if it now matches an element with different text the DOM
  // has probably shifted, so prefer an element with the original text.
  function resolvePin(pin) {
    var el = null;
    if (pin.selector) {
      try {
        el = document.querySelector(pin.selector);
      } catch {
        el = null;
      }
    }
    if (pin.text && (!el || textOf(el) !== pin.text)) {
      var byText = findByText(pin.selector ? tagFromSelector(pin.selector) : "*", pin.text);
      if (byText) el = byText;
    }
    return el;
  }

  function resolveAll() {
    resolved = {};
    for (var i = 0; i < pins.length; i++) resolved[pins[i].id] = resolvePin(pins[i]);
    schedule();
  }

  // Throttled, not debounced: a page that never stops mutating (carousels,
  // tickers) would otherwise never re-resolve.
  function scheduleResolve() {
    if (resolveTimer) return;
    resolveTimer = setTimeout(function () {
      resolveTimer = 0;
      resolveAll();
    }, 250);
  }

  function sendLayout() {
    frame = 0;
    var positions = [];
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      var el = resolved[pin.id];
      var r = el && el.isConnected ? el.getBoundingClientRect() : null;
      if (r && (r.width || r.height)) {
        positions.push({
          id: pin.id,
          x: r.left + pin.offsetX * r.width,
          y: r.top + pin.offsetY * r.height,
          found: true,
        });
      } else {
        positions.push({ id: pin.id, x: pin.docX - scrollX, y: pin.docY - scrollY, found: false });
      }
    }
    var layout = {
      type: "layout",
      url: pageUrl(),
      scrollX: scrollX,
      scrollY: scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      pins: positions,
      hover: mode === "comment" && hoverEl && hoverEl.isConnected ? describe(hoverEl, false) : null,
    };
    var serialized = JSON.stringify(layout);
    if (serialized === lastLayout) return;
    lastLayout = serialized;
    post(layout);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sendLayout);
  }

  function setMode(next) {
    mode = next === "comment" ? "comment" : "browse";
    if (mode === "comment" && !cursorStyle) {
      cursorStyle = document.createElement("style");
      cursorStyle.textContent = "*{cursor:crosshair!important}";
      document.documentElement.appendChild(cursorStyle);
    } else if (mode === "browse" && cursorStyle) {
      cursorStyle.remove();
      cursorStyle = null;
    }
    if (mode === "browse") hoverEl = null;
    schedule();
  }

  // In comment mode the page shouldn't react to clicks — they place pins.
  // Capture-phase listeners on window run before the site's own handlers.
  function block(event) {
    if (mode !== "comment") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== "click") return;
    var el = event.target;
    if (!(el instanceof Element)) return;
    post({
      type: "pick",
      url: pageUrl(),
      element: describe(el, true),
      docPoint: { x: event.clientX + scrollX, y: event.clientY + scrollY },
    });
  }

  for (var i = 0; i < BLOCKED_EVENTS.length; i++) {
    window.addEventListener(BLOCKED_EVENTS[i], block, { capture: true, passive: false });
  }

  window.addEventListener(
    "pointermove",
    function (event) {
      if (mode !== "comment") return;
      var el = event.target instanceof Element ? event.target : null;
      if (el !== hoverEl) {
        hoverEl = el;
        schedule();
      }
    },
    true
  );
  document.documentElement.addEventListener("mouseleave", function () {
    hoverEl = null;
    schedule();
  });

  document.addEventListener("scroll", schedule, { capture: true, passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("load", resolveAll);

  new MutationObserver(function () {
    scheduleResolve();
    schedule();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  // Animations and transitions move things without a scroll or mutation.
  setInterval(schedule, 500);

  window.addEventListener("message", function (event) {
    if (event.origin !== APP_ORIGIN || event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.source !== APP) return;

    if (data.type === "hello") {
      lastLayout = "";
      post({ type: "ready", version: VERSION, url: pageUrl(), proxied: !!REAL_ORIGIN });
      schedule();
    } else if (data.type === "mode") {
      setMode(data.mode);
    } else if (data.type === "pins" && Array.isArray(data.pins)) {
      pins = data.pins;
      resolveAll();
    } else if (data.type === "scrollTo" && typeof data.y === "number") {
      window.scrollTo({ top: data.y, left: 0, behavior: "instant" });
    }
  });

  post({ type: "ready", version: VERSION, url: pageUrl(), proxied: !!REAL_ORIGIN });
})();
