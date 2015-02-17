/** use this code in console to access global for this file

var XPIProviderBP = Components.utils.import("resource://gre/modules/XPIProvider.jsm")
XPIProviderBP.XPIProvider.bootstrapScopes["instant@maps.de"]

/******************************************************************/
var BASE_URI = "chrome://instantfox/content/"
var {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");

var addScript = function(src, win) Services.scriptloader.loadSubScript(BASE_URI + src + ".js", win);
/*devel__)*/


function loadIntoWindow(win, isNew) {
	/*devel__)*/
	for each (var src in ["instantfox", "contentHandler", "overlay", "contextMenu"]) 
		addScript(src, win)

	try {
		win.InstantFox.initialize(isNew)
	} catch(e) {Cu.reportError(e)}
}

function unloadFromWindow(win){
	try {
		// delete all added variables and remove eventListeners
		win.InstantFox.destroy()
	}catch(e){Cu.reportError(e)}
}

function windowWatcher(win, topic) {
	if (topic == "domwindowopened") {
		win.addEventListener("load", function() {
			win.removeEventListener("load", arguments.callee, false);
			if (win.location.href == 'chrome://browser/content/browser.xul')
				loadIntoWindow(win, true)
		}, false);
	}
}

/**************************************************************************
 * bootstrap.js API
 *****************/
function startup(aData, aReason) {
	if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)  
		Components.manager.QueryInterface(Ci.nsIComponentRegistrar)
							.addBootstrappedManifestLocation(aData.installPath)
	Services.io.getProtocolHandler('resource')
		.QueryInterface(Ci.nsIResProtocolHandler)
		.setSubstitution(
			'instantfox',
			Services.io.newURI(__SCRIPT_URI_SPEC__+'/../modules/', null, null)    
		)

	// Load into any existing windows
	var enumerator = Services.wm.getEnumerator("navigator:browser");
	while (enumerator.hasMoreElements()) {
		var win = enumerator.getNext();
		loadIntoWindow(win);
	}
	// Load into all new windows
	Services.ww.registerNotification(windowWatcher);
}

function showUninstallPage(aData, aReason) {
	// addon manager gives buggy information about uninstalling, so we look up the pressed button
	try {
		var el = Cc["@mozilla.org/focus-manager;1"].getService(Ci.nsIFocusManager).focusedElement
		var isUninstall = el && el.className.indexOf("remove") > 0
	}catch(e){}
	var pb = Services.prefs.getBranch('extensions.InstantFox.')
	var noticeshown = pb.prefHasUserValue("uninstalled") && pb.getCharPref("uninstalled")
	var win = Services.wm.getMostRecentWindow('navigator:browser')
	var iFox = win.InstantFox
	if (noticeshown != aData.version) {
		var im = win.InstantFoxModule
		var url = isUninstall ? im.uninstallURL : im.deactivatedURL;
		iFox.addTab(url + '?version=' + aData.version + '&face=:(')
		pb.setCharPref("uninstalled", aData.version)
	}
	// restore searchbar
	var e = Services.wm.getEnumerator("navigator:browser")
	while(e.hasMoreElements()) try {
		iFox = e.getNext().InstantFox
		
		iFox && iFox.updateToolbarItems("uninstall");
	} catch(e) {Cu.reportError(e)}
	// pb.clearUserPref("removeOptions")
	// pb.clearUserPref("removeSearchbar")
	pb.clearUserPref('version')
}

function shutdown(aData, aReason) {


	// no need to cleanup, everything goes to die anyway
	if (aReason == APP_SHUTDOWN)
		return;
	
	// || aReason == ADDON_UNINSTALL happens on update ?
	if (aReason == ADDON_DISABLE ) try {
		showUninstallPage(aData, aReason)
	} catch (e) {Cu.reportError(e)}
	
	// Unload from any existing windows
	var enumerator = Services.wm.getEnumerator("navigator:browser");
	while (enumerator.hasMoreElements()) {
		var win = enumerator.getNext();
		unloadFromWindow(win);
	}
	Services.ww.unregisterNotification(windowWatcher)
	
	Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler)
		.setSubstitution('instantfox',null)
	
	if (Services.vc.compare(Services.appinfo.platformVersion, "10.0") < 0)  
		Components.manager.QueryInterface(Ci.nsIComponentRegistrar)
			.removeBootstrappedManifestLocation(aData.installPath)
	
	Cu.import('chrome://instantfox/content/instantfoxModule.js')
    InstantFoxModule.shutdown()

	Cu.unload('chrome://instantfox/content/instantfoxModule.js')
	Cu.unload('chrome://instantfox/content/defaultPluginList.js')
	
	/*devel__)*/
}

function install(aData, aReason) {
	/*devel__)*/
}

function uninstall(aData, aReason) {
	/*devel__)*/
}
