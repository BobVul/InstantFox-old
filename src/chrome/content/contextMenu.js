/* global InstantFox, dump, InstantFoxModule, Cu, Cc, Ci, 
    gNavigatorBundle, Services, gBrowser, openLinkIn,
    nsContextMenu, content */
/*********************************************************
 * contextMenu
 *******/
InstantFox.modifyContextMenu = function(enable){
    if (enable == undefined) {
        let prefName = "extensions.InstantFox.context.usedefault";
        enable = !(Services.prefs.prefHasUserValue(prefName) && Services.prefs.getBoolPref(prefName));
    }
    let proto = nsContextMenu.prototype;
    // stupid rename in firefox 18
    var bundleName;
    var hide;
    var getBundleName = function() {
        try {
            bundleName = "contextMenuSearchText";
            gNavigatorBundle.getFormattedString(bundleName, []);
            return bundleName;
        }catch(e){}
        try {
            bundleName = "contextMenuSearch";
            gNavigatorBundle.getFormattedString(bundleName, []);
            return bundleName;
        }catch(e){}
    };
    var getLabel = function(name, text) {
        try {
            return gNavigatorBundle.getFormattedString(bundleName||getBundleName(), [name, text]);
        }catch(e){return "..." + text}
    };
    var getKey = function(){
        try {
            return gNavigatorBundle.getString(bundleName + ".accesskey");
        }catch(e){return " "}
    };
    
    if (typeof proto["formatSearchContextItem"] == "function")
        var fnName = "formatSearchContextItem";
    else if (typeof proto["isTextSelection"] == "function")
        var fnName = "isTextSelection";
        
    if (!fnName) return;    
    var fnName_orig = fnName + "_orig";
    
    if (enable && !proto[fnName_orig]) {
        proto[fnName_orig] = proto[fnName_orig] || proto[fnName];
        proto[fnName] = function() {
            var splitMenu = document.getElementById("ifox-context-searchselect") || this.createSearchItem();
            var menuitem = splitMenu.menuitem;

            var selectedText = this.getSelectedText(), croppedText = selectedText;

            if (!selectedText) {
                splitMenu.hidden = true;
                return false;
            }
            
            // reset flag tracking command after click
            splitMenu.$ignoreCommand = false;

            if (selectedText.length > 15)
                croppedText = selectedText.substr(0,15) + this.ellipsis;

            var engineId = InstantFoxModule.getContextMenuPlugins("default");
            var engine = InstantFoxModule.Plugins[engineId] || {};

            // format "Search <engine> for <selection>" string to show in menu
            var menuLabel = getLabel(engine.name, croppedText);
            if (menuitem) {
                menuitem.label = menuLabel;
                menuitem.image = engine.iconURI;
                splitMenu.setAttribute('name', engine.id);
                menuitem.accessKey = getKey();
                splitMenu.hidden = false;
            }
            // this caches the selected text in isTextSelected
            return selectedText;
        };

        proto.createSearchItem = function(){
            var old = document.getElementById("context-searchselect");
            if(old){
                nsContextMenu.prototype.oldNode = old;
                nsContextMenu.prototype.oldNodePosId = old.nextSibling && old.nextSibling.id;
                InstantFox.rem(old);
            }

            var m = InstantFox.$el('menu', {
                'id':         "ifox-context-searchselect",
                'type':       "splitmenu",
                'onclick':    "gContextMenu&&gContextMenu.doSearch(event, 'mouse')",
                'oncommand':  "gContextMenu&&gContextMenu.doSearch(event, 'command')",
                'class':      "menu-non-iconic"
            });

            var p = InstantFox.$el('menupopup', {
                'onpopupshowing': "InstantFox.fillSearchSubmenu(this)"
            }, m);

            InstantFox.initPopupEvents(p);

            var s = document.getElementById("context-sep-open");
            var c = document.getElementById("contentAreaContextMenu");
            c.insertBefore(m, s);
            c.addEventListener("popuphiding", hide = function(e) {
                if (e.target == e.currentTarget)
                    m.hidden = true;
            });
            return m;
        };
        proto.getSelectedText = function() {
            // getBrowserSelection crops to 150
            var focusedWindow = document.commandDispatcher.focusedWindow;
            var selectedText = focusedWindow.getSelection().toString();

            if (selectedText)
                return selectedText;
            try{
                var editor = content.document.activeElement
                    .QueryInterface(Ci.nsIDOMNSEditableElement).editor;
            }catch(e){
                try{
                    editor = document.popupNode
                        .QueryInterface(Ci.nsIDOMNSEditableElement).editor;
                }catch(e){}
            }
            try{
                return editor.selection.toString();
            }catch(e){}
            return '';
        };
        InstantFox.fillSearchSubmenu = function(popup, engineList) {
            var menuItem;
            while(menuItem = popup.firstChild)
                popup.removeChild(menuItem);

            var $el = InstantFox.$el;

            void (engineList || InstantFoxModule.contextMenuPlugins).forEach(function(id) {
                var engine = InstantFoxModule.Plugins[id];
                if (engine) {
                    $el('menuitem', {
                        'name' : engine.id,
                        'label': engine.name,
                        'image': engine.iconURI,
                        'class': "menuitem-iconic",
                    }, popup);
                } else if (id == "-") {
                    $el('menuseparator', {'name': id}, popup);
                } else if (id == "__search_site__") {
                    $el('menuitem', {
                        'name' :  id,
                        'label':  InstantFoxModule.getString("context.searchSite")
                    }, popup);
                }
            });
        };
        proto.doSearch = function(e, source) {
            if(e.target.menuitem && !e.target.isMenuitemActive)
                return;
            // needed to prevent calling command listener after click listener
            if(source == 'command' && e.currentTarget.$ignoreCommand)
                return;
            if(e.button != 1)
                e.currentTarget.$ignoreCommand = true;

            var name = e.target.getAttribute('name'), href;
            if (!name)
                return;
            var selectedText = this.getSelectedText();
            if (name == '__open_as_link__') {
                href = selectedText;
            } else if (name == '__search_site__'){
                href = InstantFoxModule.urlFromQuery("google", selectedText + ' site:' + gBrowser.currentURI.host)
            } else {
                href = InstantFoxModule.urlFromQuery(name, selectedText);
            }

            this.openLinkIn(href, e);
        };
        proto.openLinkIn = function(href, e, postData, fixup){
            var where = e.target.getAttribute('where') || "tab";
            if(e.button == 1)
                where = "tabshifted";
            else if(e.button == 2)
                where = "current";
            if(e.ctrlKey || e.altKey){
                if(where == 'tab')
                    where = 'tabshifted';
                else if(where == 'tabshifted')
                    where = 'tab';
            }else if(e.shiftKey && where != 'current')
                where = 'current';

            openLinkIn(href, where, fixup||{
                postData: postData,
                relatedToCurrent: true,
                linkNode: document.popupNode // this is needed only for treeStyleTab addon
            });
        }
    }
    else if(!enable && proto[fnName_orig]){
        proto[fnName] = proto[fnName_orig];
        delete proto[fnName_orig];
        delete proto.createSearchItem;
        delete proto.getSelectedText;
        delete proto.doSearch;
        delete proto.openLinkIn;
        let popup = document.getElementById("contentAreaContextMenu");
        let node = document.getElementById("ifox-context-searchselect");
        popup.removeEventListener("popuphiding", hide);
        InstantFox.rem(node);
        proto.oldNode && popup.insertBefore(proto.oldNode, proto.oldNodePosId && document.getElementById(proto.oldNodePosId));
    }
};



        //el = document.getElementById("ss")
/*********************************************************
 * contextMenu
 *******/
InstantFox.initPopupEvents = function(el) {
    var lastMouseEvent, timer, tooltip, right;
    /*** TOOLTIP ***/
    var updateTooltip = function() {
        timer = null;
        if (!tooltip) {
            tooltip = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
            document.documentElement.appendChild(tooltip);
            tooltip.textContent = InstantFoxModule.getString("context.Drag");
            tooltip.style.cssText = "position: fixed; display: none; -moz-appearance: tooltip;";
        }
        var rect = el.getBoundingClientRect();

        var x = lastMouseEvent.clientX;
        var y = lastMouseEvent.clientY;
        right = lastMouseEvent.screenX - x + rect.right + 5;
        if (shouldShow(x, y, rect)) {
            tooltip.style.display = "";
            tooltip.style.top = rect.top  + 1 + "px";
            tooltip.style.left = rect.right + 1 + "px";
        } else {
            tooltip.style.display = "none";
        }
    };
    var onTooltipMouseMove = function(e){
        lastMouseEvent = e;
        if (!timer)
            timer = setTimeout(updateTooltip, 100);
    };
    var onTooltipMouseOut = function(e){
        lastMouseEvent = e
        if (!timer)
            timer = setTimeout(updateTooltip, 100)
    };
    function enableTooltip(){
        timer = false;
        el.addEventListener("mousemove", onTooltipMouseMove)
        el.addEventListener("mouseout", onTooltipMouseOut)
    };
    function disableTooltip(){
        el.removeEventListener("mousemove", onTooltipMouseMove);
        el.removeEventListener("mouseout", onTooltipMouseOut);
        tooltip.style.display = "none";
        if (timer)
            clearTimeout(timer);
    }
    enableTooltip();

    /*** drag menuitems ***/
    function shouldShow(x, y, rect) {
        return rect.left < x && x < rect.right
            && rect.top  < y && y < rect.bottom;
    }
    function isOutside(x, y, rect, d) {
        if (rect.left - d > x || rect.right + d < x)
            return true;
        if (rect.top - d > y || rect.bottom + d < y)
            return true;
    }
    function getChild(y) {
        var ch = el.children;
        for(var i = 0; i < ch.length; i++) {
            var rect = ch[i].getBoundingClientRect();
            var top = rect.top - (ch[i].dy || 0);
            var bottom = rect.bottom - (ch[i].dy || 0);
            if (top < y &&  bottom > y)
                return {index: i, el: ch[i]};
        }
    }
    function translate(el, dx, dy) {
        el.style.MozTransform = "translate(" + dx + "px," + dy + "px)";
        el.dy = dy;
    }

    el.addEventListener("mousedown", function(e) {
        var state = "wait";
        
        var startY = e.clientY;
        var drag = getChild(startY);
        if (!drag)
            return;
        var dragEl = drag.el;
        var dragElRect = dragEl.getBoundingClientRect();
        var h = dragElRect.height;
        var dragOffset = -startY + dragElRect.top + h / 2;

        var popupRect = el.getBoundingClientRect();
        dragEl.setAttribute("_moz-menuactive", true);
        dragEl.setCapture(true);
        dragEl.style.cssText = "position:absolute;z-index:10000";
        setTimeout(function() {
            dragEl.setAttribute("_moz-menuactive", true);
        });

        var movedElements = [];
        var current, onMove, onUp;
        var onMove = function(e) {
            var {clientX: x, clientY: y} = e;

            if (state == "wait") {
                if (isOutside(x, y, dragElRect, 0))
                    state = "drag";
                else
                    return;
            }

            if (isOutside(x, y, popupRect, 5)) {
                var d = 0
                dragEl.style.opacity =  "0.1"
                translate(dragEl, 50, 0)
                for(var i = movedElements.length; i--;){
                    translate(movedElements[i], 0, 0)
                }
                current = null
            } else {
                var d = e.clientY -  startY
                
                // if (!morePopup){
                //     morePopup = setTimeout(showMoreItems,0,el)
                // }

                dragEl.style.opacity =  ""
                translate(dragEl, 10, d)

                current = getChild(y + dragOffset) || current
                if (current) {
                    for(var i = movedElements.length; i--;){
                        translate(movedElements[i], 0, 0)
                    }
                    movedElements=[]
                    if (current.index > drag.index) {
                        var ch = el.children
                        for(var i = drag.index+1; i < current.index+1; i++) {
                            var elt = ch[i];
                            movedElements.push(elt)
                            translate(elt, 0, -h)
                        }
                    } else if (current.index < drag.index) {
                        var ch = el.children
                        for(var i = drag.index-1; i > current.index-1; i--) {
                            var elt = ch[i];
                            movedElements.push(elt)
                            translate(elt, 0, h)
                        }
                    }
                }
            }

            e.preventDefault()
            e.stopPropagation()
        }

        var onUp = function(e) {
            el.removeEventListener("mouseup", onUp, true)
            el.removeEventListener("mousemove", onMove, true)
            disableTooltip()
            if (state == "wait")
                return;
            // stop the event
            e.preventDefault()
            e.stopPropagation()

            translate(dragEl, 0, 0)
            for(var i = movedElements.length; i--;) {
                translate(movedElements[i], 0, 0)
            }
            dragEl.style.cssText=""
            
            // todo change when removing is enabled
            if (!current)
                current = drag
            
            if (current) {
                var next = current.index >= drag.index ? current.el.nextSibling : current.el;
                var curr = drag.el.cloneNode(true)
                el.insertBefore(curr, next)
            }
            // do this to not get click event
            el.removeChild(drag.el)
            updateFirstItem(el, current || {}, drag)

            // reenable tooltip
            enableTooltip()

            InstantFoxModule.contextMenuPlugins = []
            var ch = el.children
            for (var i = ch.length; i--;) {
                InstantFoxModule.contextMenuPlugins.unshift(ch[i].getAttribute("name"))
            }
            InstantFoxModule.pluginLoader.scheduleSavePlugins(setTimeout)
        }

        el.addEventListener("mousemove", onMove, true)
        el.addEventListener("mouseup", onUp, true)
    })
    
    // var morePopup
    // function showMoreItems(anchor){
        // var y = InstantFox.$el("panel", {noautohide:true}, document.documentElement)
        // InstantFox.fillSearchSubmenu(y, InstantFoxModule.getContextMenuPlugins("off"))
        // y.openPopup(anchor, "start_after")
        // return morePopup = y
    // }

    function updateFirstItem(popup, current, drag) {
        if (current.index == 0)
            var currentLabel = current.el.label;
        else if (drag.index == 0)
            var currentLabel = drag.el.label;
        else
            return;
        var first = popup.firstChild;
        var splitMenu = document.getElementById("ifox-context-searchselect") || this.createSearchItem();
        var menuitem = splitMenu.menuitem;
        menuitem.label = menuitem.label.replace(currentLabel, first.label);
        menuitem.image = first.image;
        splitMenu.setAttribute('name', first.id);
    }
}