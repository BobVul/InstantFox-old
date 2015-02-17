/* global InstantFox, dump, InstantFoxModule, Cu, Cc, Ci, 
    gNavigatorBundle, Services, gBrowser, gNavToolbox,
    nsContextMenu, content, Components, XULBrowserWindow,
    BrowserToolboxCustomizeDone */
/*jshint asi:true*/    

/* devel__) */
InstantFox.applyOverlay = function(off) {
    var $el = InstantFox.$el, $ = InstantFox.$, rem = InstantFox.rem
    var buttonId = 'instantFox-options', popupId = 'instantfox-popup'
    if (off) {
        [
            gNavToolbox.palette.querySelector("#" + buttonId),
            $(buttonId),
            $(popupId),
            $("instantFox-menuitem"),
        ].forEach(rem)
        return
    }

    /* devel__) */

    // ---------------------------
    var options = {
        id: popupId, noautohide:'true',
        // position:'after_end',
        persist:'width,height', width:'400', height:'600',
        onpopupshowing: "if(event.target==this)InstantFox.onPopupShowing(this)",
        onpopuphiding: "if(event.target==this)InstantFox.onPopupHiding(this)",
        type: "arrow",
        flip: 'slide',
        animate:'true',
        position: 'bottomcenter topright',
        noautofocus: 'true',
        side: 'top',
        consumeoutsideclicks: 'false',
    }
    InstantFox.updatePopupSize(options)
    $el("panel", options, [$el("stack", {flex: 1}, [
        $el('resizer', {element: popupId, dir:'bottomleft',
            left:'0', bottom:'0', width:'16', height:'16', style:'-moz-transform: rotate(90deg);'
        })
    ])], $("mainPopupSet"));
    // ---------------------------

    var toolbarButton = $el('toolbarbutton', {type:"menu", popup: popupId, id: buttonId,
        class:'toolbarbutton-1 chromeclass-toolbar-additional',
        image:InstantFoxModule.buttonLogoURL, label:'InstantFox'
    }, gNavToolbox.palette);

    var id = buttonId
    var selector = "[currentset^='" + id + ",'],[currentset*='," + id + ",'],[currentset$='," + id + "']"
    var toolbar = document.querySelector(selector)
    
    toolbar ? insertButton() : insertMenuitem()

    function insertButton() {
        var currentset = toolbar.getAttribute("currentset").split(",");
        var i = currentset.indexOf(id) + 1;

        var len = currentset.length, beforeEl;
        while (i < len && !(beforeEl = $(currentset[i])))
            i++;

        toolbar.insertItem(id, beforeEl);
    }
    
    function insertMenuitem() {
        InstantFox.updateMenuitem(true)        
    }
}
InstantFox.updateMenuitem = function(show) {
    var $el = InstantFox.$el, $ = InstantFox.$, rem = InstantFox.rem
    var popup = $("menu_ToolsPopup")
    var mi = $("instantFox-menuitem")
    
    if (!popup)
        return;
    if (!show)
        return mi && rem(mi);

    mi || popup.insertBefore($el("menuitem", {
          id:"instantFox-menuitem"
        , image: InstantFoxModule.buttonLogoURL
        , onclick:'document.getElementById("instantfox-popup").openPopup(gNavToolbox)', label: "InstantFox Options"
        , class: "menuitem-iconic"
    }), $("prefSep"))
}

//************************************************************************
// options popup
InstantFox.popupCloser = function(e) {
    var inPopup = InstantFox.clickedInPopup
    InstantFox.clickedInPopup = false
    if (inPopup || e.target.nodeName == 'resizer')
        return
    if (e.target.id == 'instantFox-options') {
        e.stopPropagation()
        e.preventDefault()
    }
    window.removeEventListener('mousedown', InstantFox.popupCloser, false)
    document.getElementById('instantfox-popup').hidePopup()
}
InstantFox.onPopupShowing = function(p) {
    if (p.id != 'instantfox-popup')
        return
    
    if (!p.hidePopup_orig) {
        p.hidePopup_orig = p.hidePopup;
        p.hidePopup = function() {
            this.hidePopup_orig()
            // workaround for firefox 32 bug
            if (this.getBoundingClientRect().width) {
                var ifr = this.querySelector("iframe");
                var w = ifr && ifr.contentWindow;
                if (w) {
                    w.openEditPopup(w.$('shortcuts').firstElementChild)
                } else {
                    this.parentNode.appendChild(this)
                    this.parentNode.insertBefore(this, this.parentNode.firstChild)
                }
            }
        }
    }
    
    var button = document.getElementById('instantFox-options')
    button && button.setAttribute("open", true)
    window.addEventListener('mousedown', InstantFox.popupCloser, false)

    var st = p.querySelector('stack')
    var ifr = p.querySelector('iframe')
    if (ifr) {
        // touch the stack, otherwise it isn't drawn in nightly
        st.flex = 0
        st.flex = 1
        // rebuild in case user modified plugins by another options window instance
        try {
            ifr.contentWindow.onOptionsPopupShowing()
        } catch(e){Components.utils.reportError(e)}
        return;
    }
    ifr = InstantFox.$el('iframe', {
        src: 'chrome://instantfox/content/options.xul',
        flex: '1'
    });
    st.insertBefore(ifr, st.firstChild)
}
InstantFox.onPopupHiding = function(p) {
    var ifr = p.querySelector('iframe')
    ifr.contentWindow.saveChanges()
    window.removeEventListener('mousedown', InstantFox.popupCloser, false)
    var button = document.getElementById('instantFox-options')
    button && button.removeAttribute("open");
}
InstantFox.updatePopupSize = function(options) {
    try {
        var xulStore = Cc["@mozilla.org/xul/xulstore;1"].getService(Ci.nsIXULStore);
    } catch(e) {Cu.reportError(e)}
    var root = "chrome://browser/content/browser.xul";
    var getPersist = function getPersist(aProperty) {
        return xulStore && xulStore.getValue(root, "instantfox-popup", aProperty);
    }
    options.width  = getPersist("width")  || options.width
    options.height = getPersist("height") || options.height
}
InstantFox.popupClickListener = function(e) {
    InstantFox.clickedInPopup = true
}
InstantFox.closeOptionsPopup = function(p) {
    p = p || document.getElementById('instantfox-popup')
    p.hidePopup()
}
InstantFox.openHelp = function() {
    var url = InstantFoxModule.helpURL
    gBrowser.loadOneTab(url, {inBackground: false, relatedToCurrent: true});
}

// mode = ""           follow prefs
// mode = "install"    remove searchbox and add instantfox button
// mode = "uninstall"  add searchbox if 
InstantFox.updateToolbarItems = function(mode) {		
    var navBar = document.getElementById("nav-bar");
    var curSet = navBar.currentSet.split(",");
    //**********************************************
    var oldId = "search-container"
    var newId = "instantFox-options"
    var getSearchbarPosition = function(){
        var pos = curSet.indexOf("urlbar-container") + 1;
        if (pos) {
            while (['reload-button', 'stop-button', 'search-container'].indexOf(curSet[pos]) != -1)
                pos++
        } else {
            pos = curSet.length;
        }
        return pos
    }
    var pb = Services.prefs.getBranch("extensions.InstantFox.")
    var getPref = function(name, defVal) {
        if (pb.prefHasUserValue(name))
            return pb.getBoolPref(name)
        else
            return defVal
    }
    //**********************************************
    var shouldRemoveSearchbar = getPref("removeSearchbar", true)
    var shouldRemoveOptions = getPref("removeOptions", false)
    if (mode == "install"){
        if (shouldRemoveOptions)
            return;

        if (!InstantFoxModule._defToolbarSet)
            InstantFoxModule._defToolbarSet = curSet.concat()
        
        var i1 = curSet.indexOf(newId)
        var i2 = curSet.indexOf(oldId)
        if (i1 >= 0 || document.getElementById(newId))
            return
        if (i2 != -1 && shouldRemoveSearchbar) {
            curSet[i2] = newId
        } else {
            var pos = getSearchbarPosition()
            curSet.splice(pos, 0, newId)
        }
    }
    else if (mode == "uninstall") {
        if (InstantFoxModule._defToolbarSet)
            curSet = InstantFoxModule._defToolbarSet
        else {
            var i1 = curSet.indexOf(newId)
            if (i1 >= 0 && !document.getElementById(oldId))
                curSet[i1] = oldId
        }
    }
    else {
        var item2Toolbar = function(id, remove) {
            var i = curSet.indexOf(id)
            if (remove) {
                i != -1 && curSet.splice(i, 1)
            } else if (i == -1) {
                if (document.getElementById(id))
                    return
                var pos = getSearchbarPosition()
                curSet.splice(pos, 0, id)
            }
        }

        
        item2Toolbar(oldId, shouldRemoveSearchbar)
        item2Toolbar(newId, shouldRemoveOptions)
    }

    //**********************************************
    curSet = curSet.join(",")
    if (curSet != navBar.currentSet){
        navBar.setAttribute("currentset", curSet);
        navBar.currentSet = curSet;
        document.persist(navBar.id, "currentset");
        try {
            BrowserToolboxCustomizeDone(true);
            InstantFox.updateMenuitem(curSet.indexOf(newId) == -1)
        } catch (e) {}
    }
}

InstantFox.updateToolbarPrefs = function(e) {
    InstantFoxModule._defToolbarSet = null
    var optionsButton = document.getElementById("instantFox-options")
    var searchBar = document.getElementById('search-container')

    Services.prefs.setBoolPref("extensions.InstantFox.removeSearchbar", !searchBar)
    Services.prefs.setBoolPref("extensions.InstantFox.removeOptions", !optionsButton)
    
    setTimeout(InstantFox.updateMenuitem, 0, !optionsButton)
}

