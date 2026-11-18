export const buildLoginInjection = (username: string, password: string) => `
(function () {
  try {
    function extractProfileOptions() {
      var modal = document.querySelector('#modal_user_select');
      if (!modal) return null;
      var cards = modal.querySelectorAll('.modal-body > div');
      if (!cards.length) return null;
      var options = [];
      cards.forEach(function (card) {
        var nameEl = card.querySelector('.fw-600');
        var metaDivs = card.querySelectorAll('.d-flex.gap-2.align-items-center');
        options.push({
          name: nameEl ? nameEl.textContent.trim() : '',
          userType: metaDivs[0] ? metaDivs[0].textContent.trim() : '',
          schoolName: metaDivs[1] ? metaDivs[1].textContent.trim() : '',
        });
      });
      return options;
    }

    function reportPostSubmitState() {
      var options = extractProfileOptions();
      if (options && options.length) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'SELECT_USER_OPTIONS', options: options}));
        return;
      }
      var errorEl = document.querySelector('#lblError');
      if (errorEl && errorEl.textContent.trim()) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'LOGIN_FAILED', reason: errorEl.textContent.trim()}));
      }
      // Otherwise: a real redirect is likely happening — the WebView's
      // navigation-state handling will pick that up on its own.
    }

    if (window.Sys && window.Sys.WebForms && window.Sys.WebForms.PageRequestManager) {
      window.Sys.WebForms.PageRequestManager.getInstance().add_endRequest(function () {
        reportPostSubmitState();
      });
    }

    function attemptFillAndSubmit(retriesLeft) {
      var userField = document.querySelector('#txtUserName');
      var passField = document.querySelector('input[type="password"]');

      if (!userField || !passField) {
        if (retriesLeft > 0) {
          setTimeout(function () {
            attemptFillAndSubmit(retriesLeft - 1);
          }, 200);
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: 'fields-not-found'}));
        }
        return;
      }

      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

      userField.setAttribute('autocomplete', 'off');
      passField.setAttribute('autocomplete', 'off');

      nativeSetter.call(userField, ${JSON.stringify(username)});
      userField.dispatchEvent(new Event('input', {bubbles: true}));
      nativeSetter.call(passField, ${JSON.stringify(password)});
      passField.dispatchEvent(new Event('input', {bubbles: true}));

      userField.blur();
      passField.blur();
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      var submitBtn = document.querySelector('input[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
      } else {
        window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: 'no-submit-target'}));
      }
    }

    attemptFillAndSubmit(10); // ~10 retries at 200ms apart = up to ~2s
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: String(e)}));
  }
  true;
})();
`;

/**
 * Installs page-level swipe-down detection for pull-to-refresh.
 */
export const PULL_REFRESH_INJECTION = `
(function () {
  if (window.__pullRefreshInstalled) return;
  window.__pullRefreshInstalled = true;

  var startY = null;
  var tracking = false;

  function scrollTop() {
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  // The site marks the sidebar as open by adding "toggled" to <div class="wrapper">
  function sidebarOpen() {
    var w = document.querySelector('.wrapper');
    return !!(w && w.classList.contains('toggled'));
  }

  function cancelPull() {
    tracking = false;
    startY = null;
    // Reset the native indicator to 0, then end. A zero-distance pull
    // never crosses the refresh threshold, so nothing reloads.
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'PULL_MOVE', dy: 0}));
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'PULL_END'}));
  }

  document.addEventListener('touchstart', function (e) {
    if (sidebarOpen()) {
      tracking = false;
      startY = null;
      return;
    }
    if (scrollTop() <= 0 && e.touches.length === 1) {
      startY = e.touches[0].clientY;
      tracking = true;
    } else {
      tracking = false;
      startY = null;
    }
  }, {passive: true, capture: true});

  document.addEventListener('touchmove', function (e) {
    if (!tracking || startY === null) return;
    // Sidebar got opened in the middle of a pull: abandon it
    if (sidebarOpen()) { cancelPull(); return; }
    var dy = e.touches[0].clientY - startY;
    if (scrollTop() <= 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'PULL_MOVE',
        dy: Math.max(0, dy)
      }));
    }
  }, {passive: true, capture: true});

  function handleTouchEnd() {
    if (!tracking) return;
    tracking = false;
    startY = null;
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'PULL_END'}));
  }

  document.addEventListener('touchend', handleTouchEnd, {passive: true, capture: true});
  document.addEventListener('touchcancel', handleTouchEnd, {passive: true, capture: true});
})();
true;
`;
export const buildSelectUserInjection = (index: number) => `
(function () {
  try {
    var modal = document.querySelector('#modal_user_select');
    if (!modal) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: 'modal-missing'}));
      return;
    }
    var cards = modal.querySelectorAll('.modal-body > div');
    var card = cards[${index}];
    if (!card) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: 'card-missing'}));
      return;
    }
    var btn = card.querySelector('input[type="button"], button, input[type="submit"]');
    if (btn) {
      btn.click();
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: 'select-button-missing'}));
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'INJECT_ERROR', reason: String(e)}));
  }
  true;
})();
`;

export const PRINT_OVERRIDE_INJECTION = `
(function () {
  if (window.__printOverrideInstalled) return;
  window.__printOverrideInstalled = true;

  function post(html) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify({type: 'PRINT_REQUEST', html: html}));
    } catch (e) {}
  }

  // plain window.print(): print the current page
  window.print = function () { post(document.documentElement.outerHTML); };

  // Pages that do  var w = window.open('', 'Print-Window'); w.document.write(html); w.print()
  // get a stand-in window here. The WebView cannot give the page a real second window, so the
  // written HTML is collected and handed to the app's print dialog instead.
  var prevOpen = window.open;
  window.open = function (url) {
    if (url && url !== 'about:blank') { return prevOpen.apply(window, arguments); }

    var buf = '';
    var sent = false;
    function send() {
      if (sent || !buf) { return; }
      sent = true;
      var html = buf.replace(/\\s+onload\\s*=\\s*(["'])\\s*window\\.print\\(\\)\\s*;?\\s*\\1/ig, '');
      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, function (m) { return m + '<base href="' + location.href + '">'; });
      }
      post(html);
    }

    var doc = {
      open: function () { buf = ''; sent = false; return doc; },
      write: function () { for (var i = 0; i < arguments.length; i++) { buf += String(arguments[i]); } },
      writeln: function () { for (var i = 0; i < arguments.length; i++) { buf += String(arguments[i]); } buf += '\\n'; },
      close: function () { send(); }
    };
    var win = {
      document: doc,
      closed: false,
      close: function () { win.closed = true; },
      focus: function () {},
      blur: function () {},
      print: function () { send(); },
      addEventListener: function () {},
      removeEventListener: function () {},
      location: {href: 'about:blank'}
    };
    return win;
  };
})();
true;
`;

export const MODAL_CONTROL = `
(function(){

  function hook(){

    if(typeof window.fnViewFile !== 'function')
      return;

    if(window.fnViewFile.__rnHooked)
      return;

    const original = window.fnViewFile;

    const wrapped = function(c){

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          type:'BOOK_FILE',
          url:c.getAttribute('data-href') || '',
          mime:c.getAttribute('data-mime') || '',
          dtype:c.getAttribute('data-type') || ''
        })
      );

      return false;
    };

    wrapped.__rnHooked = true;

    window.fnViewFile = wrapped;
  }

  setInterval(hook,500);

})();
true;
`;

export const UPI_INTERCEPT_INJECTION = `
(function() {
  if (window.__upiInterceptorInstalled) return;
  window.__upiInterceptorInstalled = true;

  function handleDeepLink(url) {
    if (!url || typeof url !== 'string') return false;
    if (
      url.startsWith('upi://') ||
      url.startsWith('intent://') ||
      url.startsWith('gpay://') ||
      url.startsWith('phonepe://') ||
      url.startsWith('paytmmp://') ||
      url.startsWith('bhim://')
    ) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OPEN_DEEP_LINK',
        url: url
      }));
      return true;
    }
    return false;
  }

  var origOpen = window.open;
  window.open = function(url) {
    if (handleDeepLink(url)) return null;
    return origOpen.apply(this, arguments);
  };

  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target !== document) {
      if (target.tagName === 'A' && target.href) {
        if (handleDeepLink(target.href)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
      target = target.parentNode;
    }
  }, true);
})();
true;
`;

export const DISABLE_ZOOM_INJECTION = `
(function () {
  if (window.__zoomDisabled) return;
  window.__zoomDisabled = true;

  // Overwrite the page's own viewport meta — the site ships
  // "width=device-width, initial-scale=1" with no scaling limits, which
  // is what leaves pinch-zoom enabled regardless of the native props.
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.appendChild(meta);
  }
  meta.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no'
  );

  // iOS Safari ignores user-scalable=no in some versions — block the
  // gesture events directly as a backstop.
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, {passive: false});
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, {passive: false});
  document.addEventListener('gestureend', function (e) { e.preventDefault(); }, {passive: false});

  // (no touchend double-tap handler here: the viewport lock + touch-action in NO_ZOOM already stop
  // double-tap zoom, and a handler that cancels touches within 300 ms made quick button taps get lost)
})();
true;
`;

export const IOS_FAST_TAP_INJECTION = `
(function () {
  if (window.__fastTapInstalled) return;
  window.__fastTapInstalled = true;

  var startX = 0, startY = 0, moved = false;
  var MOVE_THRESHOLD = 10;

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = false;
  }, {capture: true, passive: true});

  document.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1) return;
    var dx = Math.abs(e.touches[0].clientX - startX);
    var dy = Math.abs(e.touches[0].clientY - startY);
    if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) moved = true;
  }, {capture: true, passive: true});

  document.addEventListener('touchend', function (e) {
    if (moved) return; // this was a scroll — don't act on it at all

    var el = e.target;
    while (
      el && el !== document &&
      el.tagName !== 'A' &&
      el.tagName !== 'BUTTON' &&
      !el.hasAttribute('data-bs-toggle') &&
      !el.onclick
    ) {
      el = el.parentElement;
    }
    if (!el || el === document) return;

    e.preventDefault();
    el.click(); // real click() — fires the site's own handler (navigation, toggle, whatever it does), just without Safari's ~300ms delay
  }, {capture: true, passive: false});
})();
true;
`;


export const DISABLE_LONG_PRESS_CALLOUT = `
(function () {
  if (window.__calloutDisabled) return;
  window.__calloutDisabled = true;

  var style = document.createElement('style');
  style.textContent = \`
    * {
      -webkit-touch-callout: none !important;
    }
    img, a {
      -webkit-touch-callout: none !important;
      -webkit-user-select: none;
    }
  \`;
  document.head.appendChild(style);
})();
true;
`;

// Links to files (jpg, png, mp3, mp4, xls, pdf ... or anything on the file storage host):
// a tap starts a download in the app instead of opening a browser or a new window.
//  - links that open the site's own image viewer (Spotlight / lightbox) are NOT touched: the viewer opens,
//    and the file is only downloaded when the viewer's Download button is pressed
//  - that Download button (a script-made <a download>) is caught here and handed to the app
export const FILE_LINK_INJECTION = `
(function () {
  if (window.__fileLinkHooked) return;
  window.__fileLinkHooked = true;

  var EXT = /\\.(pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z|txt|rtf|jpe?g|png|gif|webp|bmp|mp3|wav|m4a|aac|ogg|mp4|mov|m4v|webm|3gp)$/i;
  var HOST = /(^|\\.)(amazonaws\\.com|cloudfront\\.net)$/i;
  // image viewers (the site uses Spotlight): these open their own popup on tap
  var VIEWER = '.spotlight, [data-spotlight], .glightbox, [data-fancybox], [data-lightbox], [data-toggle="lightbox"]';

  function post(o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (x) {}
  }

  function isFileHref(href) {
    try {
      if (!/^https?:/i.test(href || '')) { return false; }
      var u = new URL(href);
      return EXT.test(u.pathname) || HOST.test(u.hostname);
    } catch (e) { return false; }
  }

  // blob:/data: files made in the page (the viewer's Download button may do this)
  function sendBlobUrl(href, name) {
    fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result);
        post({type: 'FILE_BASE64', fileName: name || 'download', mime: b.type || '', data: s.substring(s.indexOf(',') + 1)});
      };
      fr.readAsDataURL(b);
    }).catch(function () {});
  }

  function nameOf(a) {
    var n = (a.getAttribute('download') || '').trim();
    if (n && n !== 'true') { return n; }
    return (a.getAttribute('data-filename') || a.textContent || '').trim();
  }

  // returns true when the app took over the download
  function takeOver(a) {
    try {
      if (!a || a.tagName !== 'A') { return false; }
      var href = a.href || '';
      if (/^(blob|data):/i.test(href)) {
        if (!a.hasAttribute('download')) { return false; }
        sendBlobUrl(href, nameOf(a));
        return true;
      }
      if (isFileHref(href)) {
        post({type: 'DOWNLOAD_FILE', url: href, name: nameOf(a)});
        return true;
      }
    } catch (e) {}
    return false;
  }

  // 1) the viewer's Download button: a script-made <a download href="file"> that gets clicked
  try {
    var origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download') && takeOver(this)) { return; }
      return origClick.apply(this, arguments);
    };
    var origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && this && this.tagName === 'A' && this.hasAttribute('download') && takeOver(this)) {
        return true;
      }
      return origDispatch.apply(this, arguments);
    };
  } catch (x) {}

  // 2) a tap on an ordinary file link
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) { return; }
    // opens the site's own viewer / popup: leave it alone
    if (a.matches && a.matches(VIEWER)) { return; }
    if (a.closest && a.closest(VIEWER) === a) { return; }
    if (!isFileHref(a.href)) { return; }
    e.preventDefault();
    e.stopPropagation();
    post({type: 'DOWNLOAD_FILE', url: a.href, name: nameOf(a)});
  }, true);
})();
true;
`;

export const EXPORT_INTERCEPT_INJECTION = `
(function () {
  if (window.__exportHooked) return;
  window.__exportHooked = true;

  var RX = /export|excel|xls|csv/i;
  var CHUNK = 262144;            // characters per message (multiple of 4, so base64 stays aligned)
  var busy = false;
  var busyTimer = null;

  function post(o) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {}
  }
  function release() { busy = false; if (busyTimer) { clearTimeout(busyTimer); busyTimer = null; } }
  function fail(reason) { release(); post({type: 'EXPORT_ERROR', reason: String(reason || 'unknown')}); }
  function passThrough(el) { window.__skipExport = true; el.click(); }   // let the page do its normal thing

  // Send the file to the app in small pieces (one huge message can be dropped on low-memory devices)
  function sendFile(blob, fileName) {
    var fr = new FileReader();
    fr.onerror = function () { fail('could not read the file'); };
    fr.onload = function () {
      try {
        var s = String(fr.result);
        var start = s.indexOf(',') + 1;
        var total = s.length - start;
        var id = String(Date.now()) + Math.random().toString(36).slice(2, 7);
        var pos = 0;
        post({type: 'FILE_START', id: id, fileName: fileName, mime: blob.type || '', total: total});
        (function next() {
          try {
            if (pos >= total) {
              post({type: 'FILE_END', id: id});
              release();
              return;
            }
            post({type: 'FILE_CHUNK', id: id, data: s.substr(start + pos, CHUNK)});
            pos += CHUNK;
            setTimeout(next, 0);
          } catch (err) { fail(err); }
        })();
      } catch (err) { fail(err); }
    };
    fr.readAsDataURL(blob);
  }

  // ---- Downloads built inside the page (SheetJS XLSX.writeFile, FileSaver, any <a download href="blob:...">)
  // Android WebView cannot download blob: addresses, so the click would do nothing. Catch them here
  // and send the file to the app in chunks, exactly like a server export.
  var blobs = {};
  try {
    var origCreate = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      var u = origCreate.apply(URL, arguments);
      try { if (obj && typeof obj.size === 'number') { blobs[u] = obj; } } catch (x) {}
      return u;
    };
    var origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = function (u) {
      setTimeout(function () { delete blobs[u]; }, 60000);
      return origRevoke.apply(URL, arguments);
    };
  } catch (x) {}

  function takeDownload(a) {
    try {
      if (!a || a.tagName !== 'A' || !a.hasAttribute('download')) { return false; }
      var href = a.href || '';
      if (href.indexOf('blob:') !== 0 && href.indexOf('data:') !== 0) { return false; }
      var name = a.getAttribute('download') || 'download.xlsx';
      var known = blobs[href];
      var getBlob = known ? Promise.resolve(known) : fetch(href).then(function (r) { return r.blob(); });
      post({type: 'EXPORT_START'});
      getBlob.then(function (b) { sendFile(b, name); }).catch(function (err) { fail(err); });
      return true;
    } catch (err) {
      return false;
    }
  }

  try {
    var origAClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (takeDownload(this)) { return; }
      return origAClick.apply(this, arguments);
    };
    var origDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (ev) {
      if (ev && ev.type === 'click' && takeDownload(this)) { return true; }
      return origDispatch.apply(this, arguments);
    };
  } catch (x) {}

  // a real tap on a visible <a download href="blob:...">
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (a && takeDownload(a)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  document.addEventListener('click', function (e) {
    try {
      if (window.__skipExport) { window.__skipExport = false; return; }

      var el = e.target && e.target.closest
        ? e.target.closest('input[type=submit],input[type=button],button,a')
        : null;
      if (!el) return;

      var label = [el.id, el.name, el.value, el.innerText, el.title].join(' ');
      if (!RX.test(label)) return;

      // a normal link to a real address is handled by the app's download logic, not here
      if (el.tagName === 'A') {
        var h = (el.getAttribute('href') || '').trim();
        if (h && h.charAt(0) !== '#' && !/^javascript:/i.test(h)) return;
      }

      // the button runs a script that builds the file inside the page (SheetJS etc.):
      // leave it alone, the download hook above sends the result to the app
      var oc = el.getAttribute('onclick') || '';
      var fm = oc.match(/^\\s*(?:return\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(/);
      if (fm && typeof window[fm[1]] === 'function' &&
          /XLSX|Blob|createObjectURL|table_to_|saveAs/.test(String(window[fm[1]]))) { return; }

      var form = el.form || document.forms[0];
      if (!form) return;

      e.preventDefault();
      e.stopPropagation();
      if (busy) return;               // an export is already running: ignore repeat taps
      busy = true;
      busyTimer = setTimeout(release, 180000);

      var data = new URLSearchParams(new FormData(form));
      var m = (el.getAttribute('href') || '').match(/__doPostBack\\('([^']*)','([^']*)'\\)/);
      if (m) { data.set('__EVENTTARGET', m[1]); data.set('__EVENTARGUMENT', m[2]); }
      else if (el.name) { data.set(el.name, el.value || ''); }

      fetch(form.action || location.href, {
        method: 'POST',
        body: data,
        credentials: 'include',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}
      }).then(function (r) {
        var cd = r.headers.get('Content-Disposition') || '';
        var ct = r.headers.get('Content-Type') || '';
        if (/attachment/i.test(cd) || !/text\\/html/i.test(ct)) {
          var nm = (cd.match(/filename\\*?=(?:UTF-8'')?"?([^";]+)"?/i) || [])[1] || 'export.xlsx';
          try { nm = decodeURIComponent(nm); } catch (x) {}
          post({type: 'EXPORT_START'});   // only now we know a real file is coming
          return r.blob().then(function (b) { sendFile(b, nm); });
        }
        // Not a file: let the page behave normally
        release();
        post({type: 'EXPORT_END'});
        passThrough(el);
      }).catch(function () {
        release();
        post({type: 'EXPORT_END'});
        passThrough(el);
      });
    } catch (err) {
      release();   // any script problem: do nothing special, the page's own handler runs
    }
  }, true);
})();
true;
`;

export const NO_ZOOM_INJECTION = `
       (function () {
         var CONTENT = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';

         function lockViewport() {
           var m = document.querySelector('meta[name=viewport]');
           if (!m) {
             m = document.createElement('meta');
             m.name = 'viewport';
             (document.head || document.documentElement).appendChild(m);
           }
           if (m.getAttribute('content') !== CONTENT) { m.setAttribute('content', CONTENT); }
         }
         lockViewport();

         if (!window.__noZoom) {
           window.__noZoom = true;

           // keep the viewport locked even if the site rewrites its meta tag
           try {
             new MutationObserver(lockViewport).observe(document.documentElement, {
               childList: true, subtree: true, attributes: true, attributeFilter: ['content']
             });
           } catch (e) {}

           // pan/scroll only: no pinch or double-tap zoom gestures
           var st = document.createElement('style');
           st.textContent = 'html, body { touch-action: pan-x pan-y !important; }';
           (document.head || document.documentElement).appendChild(st);

           ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
             document.addEventListener(t, function (e) { e.preventDefault(); }, {passive: false});
           });
           document.addEventListener('touchmove', function (e) {
             if (e.touches && e.touches.length > 1) { e.preventDefault(); }
           }, {passive: false});
           document.addEventListener('wheel', function (e) {
             if (e.ctrlKey) { e.preventDefault(); }
           }, {passive: false});
         }

         // Single-finger only: ignore every touch while 2 or more fingers are down
         if (!window.__singleTouch) {
           window.__singleTouch = true;
           var multi = false;

           function block(e) {
             e.stopImmediatePropagation();
             e.stopPropagation();
             if (e.cancelable) { e.preventDefault(); }
           }

           ['touchstart', 'touchmove'].forEach(function (type) {
             window.addEventListener(type, function (e) {
               if (e.touches && e.touches.length > 1) { multi = true; }
               if (multi) { block(e); }
             }, {capture: true, passive: false});
           });

           ['touchend', 'touchcancel'].forEach(function (type) {
             window.addEventListener(type, function (e) {
               if (multi) { block(e); }
               if (!e.touches || e.touches.length === 0) {
                 // keep blocking the "click" that follows a multi-finger touch, then reset
                 setTimeout(function () { multi = false; }, 350);
               }
             }, {capture: true, passive: false});
           });

           // taps/clicks that come out of a multi-finger gesture are dropped
           ['click', 'dblclick', 'contextmenu'].forEach(function (type) {
             window.addEventListener(type, function (e) { if (multi) { block(e); } }, true);
           });

           // extra fingers are not primary pointers
           ['pointerdown', 'pointermove', 'pointerup'].forEach(function (type) {
             window.addEventListener(type, function (e) {
               if (e.pointerType === 'touch' && e.isPrimary === false) { block(e); }
             }, true);
           });
         }
       })();
       true;
       `;

export const PULL_GUARD_INJECTION = `
       (function () {
         if (window.__pullGuard) { return; }
         window.__pullGuard = true;
         var last = null;

         function post(block) {
           if (block === last) { return; }
           last = block;
           try {
             window.ReactNativeWebView.postMessage(JSON.stringify({type: 'PULL_BLOCK', block: block}));
           } catch (e) {}
         }

         function shouldBlock(target) {
           var vw = window.innerWidth;
           var el = target;
           while (el && el.nodeType === 1 && el !== document.documentElement) {
             var cs = getComputedStyle(el);
             var scrollable = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
                              el.scrollHeight > el.clientHeight + 1;

             // an inner list that is already scrolled down: swipe scrolls it back up
             if (el !== document.body && scrollable && el.scrollTop > 0) { return true; }

             // inside a fixed panel: side menu, drawer, modal, popup
             if (cs.position === 'fixed') {
               var r = el.getBoundingClientRect();
               if (scrollable || (r.width > 0 && r.width < vw * 0.95)) { return true; }
             }
             el = el.parentElement;
           }
           return false;
         }

         document.addEventListener('touchstart', function (e) {
           post(shouldBlock(e.target));
         }, {capture: true, passive: true});
       })();
       true;
       `;