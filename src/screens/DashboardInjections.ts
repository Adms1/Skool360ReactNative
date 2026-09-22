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

  document.addEventListener('touchstart', function (e) {
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

  window.print = function () {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'PRINT_REQUEST',
      html: document.documentElement.outerHTML,
    }));
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

  // Double-tap-to-zoom backstop.
  var lastTouch = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouch <= 300) { e.preventDefault(); }
    lastTouch = now;
  }, {passive: false});
})();
true;
`;

export const IOS_FAST_TAP_INJECTION = `
(function () {
  document.addEventListener(
    'touchend',
    function (e) {
      let el = e.target;

      while (el && el.tagName !== 'A') {
        el = el.parentElement;
      }

      if (el && el.href) {
        e.preventDefault();
        window.location.href = el.href;
      }
    },
    true
  );
})();
true;
`;
