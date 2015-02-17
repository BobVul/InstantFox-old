/********************************************************************
 * http://dev.chromium.org/searchbox
 * http://lists.whatwg.org/htdig.cgi/whatwg-whatwg.org/2010-October/028818.html
 * http://src.chromium.org/svn/trunk/src/chrome/renderer/searchbox_extension.cc
 *
 */

/* global InstantFox, dump, InstantFoxModule, gURLBar, Cu, Cc, Ci, 
    gBrowser, isTabEmpty, Services, PageProxySetIcon, gIdentityHandler,
    PrivateBrowsingUtils, NoSquint, nsIWebNavigation */
InstantFox.searchBoxAPI = {
    setStatus: function(str){
        InstantFox.pageLoader.label.value = str;
    },
    getUrl: function(){
        return this.isSupported() && this.getWindow().location.href;
    },
    getWindow: function(){
        return InstantFox.pageLoader.preview
            && InstantFox.pageLoader.preview.contentWindow
            && InstantFox.pageLoader.preview.contentWindow.wrappedJSObject;
    },
    getSearchBox: function(){
        var w;
        return (w = this.getWindow()) && (w = w.navigator) && (w = w.searchBox);
    },
    isSupported: function() {
        var sb = this.getSearchBox();


        return sb
            && !!(sb.onchange
            && sb.onsubmit
            && sb.oncancel
            && sb.onresize) || null;
    },
    urlRegexp:/(^https?:)|([#?].*$)/g,
    canLoad: function(qUrl, url2go){
        /*dump(
            qUrl , url2go,
            qUrl && url2go && qUrl.replace(this.urlRegexp, "") == url2go.replace(this.urlRegexp, "")
        )*/
        return qUrl && url2go && qUrl.replace(this.urlRegexp, "") == url2go.replace(this.urlRegexp, "");
    },
    onInput: function(){
        var q = InstantFoxModule.currentQuery;
        var text = q.shadow || q.query;

        var sb = this.getSearchBox();
        if (sb) {
            sb.selectionEnd = sb.selectionStart = text.length;
            sb.value = text;
            sb.verbatim = true;
            this.setStatus(text + " - " + (q.shadow || q.query));
            this.call(sb, "onchange");
            this.call(sb, "onresize");
        }
    },
    setDimensions: function(){
        var sb = this.getSearchBox();
        if (!sb)
            return;
        var browser = InstantFox.pageLoader.preview;

        var zoom = browser.markupDocumentViewer.fullZoom;

        var r1 = gURLBar.popup.getBoundingClientRect();
        var r2 = InstantFox.pageLoader.preview.getBoundingClientRect();

        sb.x = (r1.left - r2.left) /zoom;
        sb.y = (r1.top  - r2.top) /zoom;
        sb.height = r1.height / zoom;
        sb.width  = r1.width / zoom;

        // this.call(sb, "onresize")
        // workaround for setSelectionRange throwing error on hidden textbox
        try {
            var forms = this.getWindow().document.forms;
            for (var i = forms.length; i--; )
                forms[i].style.display = "block";
        } catch(e) {Cu.reportError(e)}
    },
    onFinish: function(q){
        if (this.delayOnSubmit)
            return;
        var sb = this.getSearchBox();
        if (!sb)
            return;
        sb.value = q;
        sb.verbatim = true;
        this.call(sb, "onchange");
        this.call(sb, "onsubmit");
    },
    addToWindow: function(){
        this.delayOnSubmit = false;

        var win = this.getWindow();
        win.navigator.searchBox = {
            value: '',
            verbatim: true,
            selectionStart: 0,
            selectionEnd: 0,
            x:0, y:0, width:0, height:0,
            setSuggestions: function(suggestions) {

            },
            // needed for firefox 15+
            __exposedProps__: {
                value: 'r', verbatim: 'r', selectionStart: 'rw', selectionEnd: 'rw',
                x: 'r', y: 'r', width: 'r', height: 'r', setSuggestions: 'r',
            onchange: 'rw', onsubmit: 'rw', oncancel: 'rw', onresize: 'rw'
            }
        };
    },
    call: function(sb, prop){

        try{
            sb[prop] && sb[prop]();
        }catch(e){
            // setSelectionRange throws on firefox if element is hidden
            // google uses it because it works on chrome
            // error here doesn't seem to cause any trouble, so do nothing for now

        }
    },
    handleEvent: function(e){
        e.currentTarget.removeEventListener(e.type, this, false);
        if(e.type == "DOMWindowCreated"){
            this.addToWindow();

        }

    },
    listen: function(el){
        el.addEventListener("load", this, false);
        el.addEventListener("DOMContentLoaded", this, false);
        el.addEventListener("DOMWindowCreated", this, false);
    },
    // do not resize box if mouse is down
    delaySubmiting: function(){
        this.delayOnSubmit = true;
        this._sb = this.getSearchBox();
        return this.doDelayedSubmiting.bind(this);
    },
    doDelayedSubmiting: function(){
        var sb = this._sb;
        if (sb) {
            this.call(sb, "onchange");
            this.call(sb, "onsubmit");
        }
        this._sb = this.delayOnSubmit = null;
    }
};


InstantFox.contentHandlers = {
    "__default__":{
        isSame: function(q, url2go){
            return q.query && q.preloadURL && url2go.toLowerCase() == q.preloadURL.toLowerCase();
        }
    },
    "google":{
        isSame: function(q, url2go){
            if (!q.query || !q.preloadURL)
                return false;
            if (url2go.toLowerCase() == q.preloadURL.toLowerCase())
                return true;

            var m1 = url2go.match(this.qRe), m2 = q.preloadURL.match(this.qRe);
            return (!m1 && !m2) || (m1 && m2 && m1[1].toLowerCase() == m2[1].toLowerCase());
        },
        transformURL: function(q, url2go) {
            try{
                var url = InstantFox.pageLoader.getCurrentLoacation();
                //
                var gDomain = url.match(/https?:\/\/((www|encrypted)\.)?google.([a-z\.]*)[^#]*/i);
                if (!gDomain)
                    return url2go;
                var query = url2go.match(/#.*/);
                if (!query)
                    return url2go;
                return gDomain[0] + query[0];
            }catch(e){
                Cu.reportError(e);
                return url2go;
            }
        },
        onLoad: function(q){
        },
        // workaround for google bug
        qRe: /[&?#]q=([^&]*)/
    }
};

InstantFox.pageLoader = {
    getCurrentLoacation: function(){
        var x;
        return ((x = this.preview)&&(x = x.contentDocument)&&x.location.href)||'';
    },
    get isActive(){
        return this.preview && this.preview.parentNode;
    },
    preview: null,
    previewIsActive: false,
    removePreview: function() {
        if(this.previewIsActive)
            this.previewIsActive = false;
        if (this.preview != null && this.preview.parentNode) {
            this.preview.parentNode.removeChild(this.preview);
            this.removeProgressListener(this.preview);
            // on firefox 20+ keeping preview browser causes errors
            this.preview = null;
        }
    },

    // Provide a way to replace the current tab with the preview
    persistPreview: function(tab, inBackground) {
        if (!this.previewIsActive)
            return;
        gURLBar.blur();
        if(tab == 'new' || (tab == undefined && InstantFoxModule.openSearchInNewTab)){
            tab = gBrowser.selectedTab;
            if(!isTabEmpty(tab)){
                gBrowser._lastRelatedTab = null;
                var relatedToCurrent = Services.prefs.getBoolPref("browser.tabs.insertRelatedAfterCurrent");
                tab = gBrowser.addTab('', {relatedToCurrent:relatedToCurrent, skipAnimation:true});
                gBrowser.selectedTab = tab;
            }
        }
        this.beforeSwap();

        var browser = this.swapBrowsers(tab);
        browser.userTypedValue = null;

        this.afterSwap();
        // Move focus out of the preview to the tab's browser before removing it

        this.preview.blur();
        inBackground || browser.focus();
        this.removePreview();
    },
    get prependHistory() {
        try {
            var si = Cu.import("resource:///modules/sessionstore/SessionStore.jsm").SessionStoreInternal;
            var TabState = Cu.import("resource:///modules/sessionstore/TabState.jsm").TabState;
            var TabStateCache = Cu.import("resource:///modules/sessionstore/TabStateCache.jsm").TabStateCache;
            var setHistory = function(browser, tabData) {
                // Flush all data from the content script synchronously. This is done so
                // that all async messages that are still on their way to chrome will
                // be ignored and don't override any tab data set when restoring.
                TabState.flush(browser);

                // Ensure the index is in bounds.
                var activeIndex = (tabData.index || tabData.entries.length) - 1;
                activeIndex = Math.min(activeIndex, tabData.entries.length - 1);
                activeIndex = Math.max(activeIndex, 0);

                // Save the index in case we updated it above.
                tabData.index = activeIndex + 1;
              
                // Start a new epoch and include the epoch in the restoreHistory
                // message. If a message is received that relates to a previous epoch, we
                // discard it.
                var epoch = si._nextRestoreEpoch++;
                si._browserEpochs.set(browser.permanentKey, epoch);

                // Update the persistent tab state cache with |tabData| information.
                TabStateCache.update(browser, {
                    history: {entries: tabData.entries, index: tabData.index}
                });

                browser.messageManager.sendAsyncMessage("SessionStore:restoreHistory",
                                                      {tabData: tabData, epoch: epoch});
            };
        } catch(e) {
            
        }
        delete this.prependHistory;
        return this.prependHistory = setHistory ? function(targetBrowser, origin) {
            // new e10s world
            var history = origin.sessionHistory.QueryInterface(Ci.nsISHistoryInternal);
            var entry;
            if (history.count > 0) {
                entry = history.getEntryAtIndex(history.index, false);
            }
            var tabData = TabStateCache.get(targetBrowser).history;
            origin._permanentKey = targetBrowser._permanentKey;
          
            if (entry) {
                var tmp = {url: entry.URI.spec, title: entry.title, ID: entry.ID, docshellID: entry.docshellID, docIdentifier: entry.ID};
                tabData.entries.splice(tabData.index, 0, tmp);
                tabData.index++;                
            }
            setHistory(origin, tabData);
        } : function(targetBrowser, origin) {
            // old world
            var history = origin.sessionHistory.QueryInterface(Ci.nsISHistoryInternal);
            var entry;
            if (history.count > 0) {
                entry = history.getEntryAtIndex(history.index, false);
                history.PurgeHistory(history.count);
            }

            // Copy over the history from the current tab if it's not empty
            var origHistory = targetBrowser.sessionHistory;
            for (var i = 0; i <= origHistory.index; i++) {
                var origEntry = origHistory.getEntryAtIndex(i, false);
                if (origEntry.URI.spec != "about:blank") history.addEntry(origEntry, true);
            }

            // Add the last entry from the preview; in-progress preview will add itself
            if (entry != null)
                history.addEntry(entry, true);
        };
    },
    
    get swapBrowsers() {
        delete this.swapBrowsers;
        try {
            var si = Cu.import("resource:///modules/sessionstore/SessionStore.jsm").SessionStoreInternal;
            var TabState = Cu.import("resource:///modules/sessionstore/TabState.jsm").TabState;
            var TabStateCache = Cu.import("resource:///modules/sessionstore/TabStateCache.jsm").TabStateCache;
            this.swapBrowsers = this.swapBrowsers_new;
        } catch(e) {
            this.swapBrowsers = this.swapBrowsers_old;
        }
        return this.swapBrowsers;
    },
    swapBrowsers_new: function(tab) {
        var origin = this.preview;
        // Mostly copied from tabbrowser.xml swapBrowsersAndCloseOther
        var gBrowser = window.gBrowser;
        var targetTab = tab || gBrowser.selectedTab;
        var targetBrowser = targetTab.linkedBrowser;
        targetBrowser.stop();
        origin.getTabBrowser = function() {};
        gBrowser.swapNewTabWithBrowser(targetTab, origin);
        targetBrowser.docShell.useGlobalHistory = true;
        return targetBrowser;
    },
    // Mostly copied from mozillaLabs instantPreview
    swapBrowsers_old: function(tab) {
        var origin = this.preview;
        // Mostly copied from tabbrowser.xml swapBrowsersAndCloseOther
        var gBrowser = window.gBrowser;
        var targetTab = tab || gBrowser.selectedTab;
        var targetBrowser = targetTab.linkedBrowser;
        targetBrowser.stop();

        // Unhook progress listener
        var targetPos = targetTab._tPos;
        var filter = gBrowser.mTabFilters[targetPos];
        targetBrowser.webProgress.removeProgressListener(filter);
        var tabListener = gBrowser.mTabListeners[targetPos];
        filter.removeProgressListener(tabListener);
        tabListener.destroy();
        var tabListenerBlank = tabListener.mBlank;

        var openPage = gBrowser._placesAutocomplete;

        // Restore current registered open URI.
        if (targetBrowser.registeredOpenURI) {
            openPage.unregisterOpenPage(targetBrowser.registeredOpenURI);
            delete targetBrowser.registeredOpenURI;
        }
        openPage.registerOpenPage(origin.currentURI);
        targetBrowser.registeredOpenURI = origin.currentURI;

        // Save the last history entry from the preview if it has loaded
        var history = origin.sessionHistory.QueryInterface(Ci.nsISHistoryInternal);
        var entry;
        if (history.count > 0) {
            entry = history.getEntryAtIndex(history.index, false);
            history.PurgeHistory(history.count);
        }

        // Copy over the history from the current tab if it's not empty
        var origHistory = targetBrowser.sessionHistory;
        for (var i = 0; i <= origHistory.index; i++) {
            var origEntry = origHistory.getEntryAtIndex(i, false);
            if (origEntry.URI.spec != "about:blank") history.addEntry(origEntry, true);
        }

        // Add the last entry from the preview; in-progress preview will add itself
        if (entry != null)
            history.addEntry(entry, true);

        // Swap the docshells then fix up various properties
        targetBrowser.swapDocShells(origin);
        targetBrowser.attachFormFill();
        gBrowser.setTabTitle(targetTab);
        gBrowser.updateCurrentBrowser(true);
        gBrowser.useDefaultIcon(targetTab);
        gURLBar.value = (targetBrowser.currentURI.spec != "about:blank") ? targetBrowser.currentURI.spec : origin.getAttribute("src");

        // Restore the progress listener
        tabListener = gBrowser.mTabProgressListener(targetTab, targetBrowser, tabListenerBlank);
        gBrowser.mTabListeners[targetPos] = tabListener;
        filter.addProgressListener(tabListener, Ci.nsIWebProgress.NOTIFY_ALL);
        targetBrowser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);

        // restore history
        targetBrowser.docShell.useGlobalHistory = true;
        return targetBrowser;
    },

    onFocus: function(e) {
        this.persistPreview();
    },
    onMouseDown: function(e) {
        // if searchBoxAPI haven't been used yet, do nothing
        if (!InstantFoxModule.currentQuery
          ||!InstantFoxModule.currentQuery.$searchBoxAPI_URL)
            return;
        InstantFox.searchBoxAPI.delaySubmiting();
        window.addEventListener("mouseup", function onup() {
            window.removeEventListener("mouseup", onup, true);
            InstantFox.searchBoxAPI.doDelayedSubmiting();
        }, true);
    },
    onTitleChanged: function(e) {
        if(e.target == InstantFox.pageLoader.preview.contentDocument)
            InstantFox.pageLoader.label.value = e.target.title;
        e.stopPropagation();
    },

    addPreview: function(url) {
        let preview = this.preview;
        let browser = window.gBrowser;
        // Create the preview if it's missing
        if (!preview || !preview.docShell) {
            preview && this.removePreview(); // 1password somehow deletes docShell

            preview = window.document.createElement("browser");
            preview.setAttribute("type", "content");

            // Copy some inherit properties of normal tabbrowsers
            preview.setAttribute("autocompletepopup", browser.getAttribute("autocompletepopup"));
            preview.setAttribute("contextmenu", browser.getAttribute("contentcontextmenu"));
            preview.setAttribute("tooltip", browser.getAttribute("contenttooltip"));

            // Prevent title changes from showing during a preview
            preview.addEventListener("DOMTitleChanged", this.onTitleChanged, true);

            // The user clicking or tabbinb to the content should indicate persist
            preview.addEventListener("focus", this.onFocus.bind(this), true);
            preview.addEventListener("mousedown", this.onMouseDown.bind(this), true);
            this.preview = preview;
        }

        // Move the preview to the current tab if switched
        let selectedStack = browser.selectedBrowser.parentNode;
        if (selectedStack != preview.parentNode){
            selectedStack.appendChild(preview);
            this.addProgressListener(preview);

            // todo: handle this elsewhere
            // set urlbaricon, this isn't possible in firefox 14+
            if (window.PageProxySetIcon)
                PageProxySetIcon('chrome://instantfox/content/skin/button-logo.png');
            gIdentityHandler.setMode(gIdentityHandler.IDENTITY_MODE_UNKNOWN);

            this.onCreatePreview(preview);
        }
        this.previewIsActive = true;
        // disable history
        preview.docShell.useGlobalHistory = false;

        InstantFox.searchBoxAPI.listen(preview);
        // Load the url i
        preview.webNavigation.loadURI(url, nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE, null, null, null);
    },

    onCreatePreview: function(preview){
        try{
            // workaround for noSquint bug
            if (window.NoSquint && NoSquint.browser) {
                preview.markupDocumentViewer.fullZoom =
                    gBrowser.markupDocumentViewer.fullZoom;
            }
        } catch(e){
            Cu.reportError(e);
        }
        
        try{
            // privateTab https://addons.mozilla.org/en-US/firefox/addon/private-tab/reviews/451236/
            if (typeof privateTab == "object" && typeof PrivateBrowsingUtils == "object" &&
                PrivateBrowsingUtils.privacyContextFromWindow(content).usePrivateBrowsing)
            PrivateBrowsingUtils.privacyContextFromWindow(preview.contentWindow).usePrivateBrowsing = true;
        } catch(e){
            Cu.reportError(e);
        }
    },
    beforeSwap: function() {
        try{
            if (window.NoSquint && NoSquint.browser) {
                var browser = gBrowser.mCurrentBrowser;
                NoSquint.browser.detach(browser);
            }
        } catch(e){
            Cu.reportError(e);
        }
    },
    afterSwap: function(){
        try{
            if (window.NoSquint && NoSquint.browser) {
                var browser = gBrowser.mCurrentBrowser;
                //try{NoSquint.browser.detach(gBrowser.mCurrentBrowser)}
                if (!browser.getUserData('nosquint')) {
                    NoSquint.browser.attach(browser);
                    NoSquint.browser.zoom(browser);
                }
            }
        } catch(e){
            Cu.reportError(e);
        }
    },

    //
    addProgressListener: function(browser) {
        // Listen for webpage loads
        if(!this.a){
            //InstantFox.pageLoader.preview.addProgressListener(this);
            this.a = true;
        }

        if(!this.image){
            var image = window.document.createElement("image");
            image.setAttribute('src', 'chrome://instantfox/content/skin/ajax-loader.gif');

            var imagebox = window.document.createElement("vbox");
            imagebox.appendChild(image);
            imagebox.setAttribute('align', 'center');

            var box = window.document.createElement("hbox");
            box.setAttribute('bottom',0);
            box.setAttribute('pack', 'center');
            box.setAttribute('align', 'center');

            var label = window.document.createElement("label");
            label.setAttribute('value','debug');

            box.appendChild(label);
            box.appendChild(imagebox);

            this.label = label;
            this.image = image;
            this.box = box;

            label.style.background = 'white';
            label.style.color = 'black';
            box.style.pointerEvents = 'none';
            box.style.opacity = '0.7';
            box.style.width = '100%';

        }

        browser.parentNode.appendChild(this.box);
    },

    removeProgressListener: function(browser) {
        this.box.parentNode.removeChild(this.box);
    },
};

