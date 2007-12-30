/*
 * Copyright 2006-2007 by Massimiliano Mirra
 * 
 * This file is part of SamePlace.
 * 
 * SamePlace is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 3 of the License, or (at your
 * option) any later version.
 * 
 * SamePlace is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *  
 */


// GLOBAL DEFINITIONS
// ----------------------------------------------------------------------

const Cc = Components.classes;
const Ci = Components.interfaces;
const pref = Cc['@mozilla.org/preferences-service;1']
.getService(Ci.nsIPrefService)
.getBranch('extensions.sameplace.');

const ns_auth = 'jabber:iq:auth';
const ns_http_auth  = 'http://jabber.org/protocol/http-auth';
const ns_x4m_ext = 'http://hyperstruct.net/xmpp4moz/protocol/external';


// GLOBAL STATE
// ----------------------------------------------------------------------

var channel;
var scriptlets = load('chrome://sameplace/contact/facades/scriptlets.js', {});
var sendTo = load('chrome://sameplace/contact/send_to.js', {});


// INITIALIZATION
// ----------------------------------------------------------------------

function initOverlay(event) {
    initNetworkReactions();
    if(experimentalMode())
        initDisplayRulesExperimental();
    else
        initDisplayRules();
    initHotkeys();
    initScriptlets();

    // Only preload SamePlace if there's no other window around with
    // an active SamePlace instance, and if this isn't a popup.'

    if(!isActiveSomewhere() && !isPopupWindow())
        loadAreas();

    upgradeCheck(
        'sameplace@hyperstruct.net',
        'extensions.sameplace.version', {
            onFirstInstall: function() {
                openURL('http://sameplace.cc/get-started');
                checkNoScript();
                runWizard();
                addToolbarButton('sameplace-button');
            },
            onUpgrade: function() {
                if(pref.getCharPref('branch') != 'devel')
                    openURL('http://sameplace.cc/changelog');
            }
        });
}

function initNetworkReactions() {
    channel = XMPP.createChannel();

    channel.on({
        event     : 'transport',
        direction : 'out',
        state     : 'start'
    }, function() {
        if(window == getMostRecentWindow() && window.toolbar.visible)
            loadAreas();
    });

    channel.on({
        event     : 'message',
        direction : 'in',
        stanza    : function(s) { return s.@type == 'chat' && s.body.text() != undefined; }
    }, function(message) {
        if(pref.getBoolPref('getAttentionOnMessage'))
            window.getAttention();
    });

    channel.on({
        event     : 'message',
        stanza    : function(s) {
            return (s.ns_x4m_ext::share != undefined &&
                    s.@type != 'error');
        }
    }, function(message) {
        if(window == getMostRecentWindow())
            seenSharedAppNegotiation(message);
    });

    channel.on({
        event     : 'message',
        direction : 'in',
        stanza    : function(s) {
            return s.ns_http_auth::confirm != undefined;
        }
    }, function(message) {
        if(window == getMostRecentWindow())
            receivedAuthConfirmRequest(message);
    });

    if(experimentalMode())
        channel.on({
            event     : 'message',
            direction : 'in',
            stanza    : function(s) {
                // Allow non-error messages with readable body [1] or
                // error messages in general [2] but not auth requests [3]
                return (((s.@type != 'error' && s.body.text() != undefined) || // [1]
                         (s.@type == 'error')) && // [2]
                        (s.ns_http_auth::confirm == undefined)) // [3]
            }
        }, function(message) {
            seenDisplayableMessage(message);
        });
}

function initDisplayRulesExperimental() {
    _('frame').addEventListener('contact/select', function(event) {
        if(isCompact())
            expand();
    }, false);
}

function initDisplayRules() {
    // Adapt toolbox frame to toolbox content.  This is done once here
    // and once in toolbox.xul onload handler.  Doing it only here
    // doesn't work for default theme; doing it only there doesn't
    // work for iFox smooth theme (assuming the theme has anything to
    // do with this).  Go figure.
    
    frameFor('toolbox').addEventListener(
        'collapse', function(event) {
            viewFor('toolbox').sizeToContent();
//             if(event.currentTarget == event.target &&
//                event.attrName == 'collapsed')
//                 setTimeout(function(){ viewFor('toolbox').sizeToContent(); }, 0)
        }, false);

    // When contact is selected, tell so to the conversation view, so
    // it may open a conversation.
    
    frameFor('contacts').addEventListener(
        'contact/select', function(event) {
            viewFor('conversations').startInteraction(
                event.target.getAttribute('account'),
                event.target.getAttribute('address'));
        }, false);

    // In some cases, conversations are not located inside the frame
    // which hosts conversation handling code.  This is the case, for
    // example, with conversations in appcontent -- they are in the
    // main window, but the code is in a frame, so listening for a
    // conversation event on the frame is useless.  Since the contact
    // list is meant to reflect conversation state regardless of where
    // in the browser/mail window conversations are located, we work
    // around that by just listening on conversation events at the
    // top window level.
    
    // Notify contact list when a conversation is focused.  If
    // conversations are hosted in a frame, only do so if the frame
    // itself is visible.  XXX needs better form.
    

    if(pref.getCharPref('conversationsArea') != 'appcontent')
        top.addEventListener(
            'conversation/focus', function(event) {
                if(!frameFor('conversations').collapsed)
                    viewFor('contacts').nowTalkingWith(
                        event.originalTarget.getAttribute('account'),
                        event.originalTarget.getAttribute('address'));
            }, false);
    else
        top.addEventListener(
            'conversation/focus', function(event) {
                viewFor('contacts').nowTalkingWith(
                    event.originalTarget.getAttribute('account'),
                    event.originalTarget.getAttribute('address'));    
            }, false);
        
    // Notify contact list when a new conversation is opened.

    top.addEventListener(
        'conversation/open', function(event) {
            viewFor('contacts').startedConversationWith(
                event.originalTarget.getAttribute('account'),
                event.originalTarget.getAttribute('address'));
        }, false);

    // Notify contact list when a conversation is closed
    
    top.addEventListener(
        'conversation/close', function(event) {
            viewFor('contacts').stoppedConversationWith(
                event.originalTarget.getAttribute('account'),
                event.originalTarget.getAttribute('address'));
        }, false);


    // We only setup rules for collapse of conversation area if the
    // conversation area truly contains conversations.  This is not
    // the case when conversationArea is appcontent--then the
    // conversation area does contain conversation code but it handles
    // conversations "off-site", in the appcontent area.
    //
    // It should probably be inferred from something closer than the
    // preference value.
    
    if(pref.getCharPref('conversationsArea') != 'appcontent') {

        // When user selects a contact, display conversation view (NOT
        // containing area -- another event handler will take care of
        // that).  We're not using conversation/focus as a trigger
        // because that also happens as a consequence of incoming
        // messages, not only of user intention.

        frameFor('contacts').addEventListener(
            'contact/select', function(event) {
                uncollapse(frameFor('conversations'));
                //viewFor('conversations').focused();
            }, false);
        
        // When last conversation closes, hide conversation view (NOT
        // containing area).
        
        frameFor('conversations').addEventListener(
            'conversation/close', function(event) {
                if(viewFor('conversations').conversations.count == 1)
                    collapse(frameFor('conversations'));
            }, false);
    }

    // When conversations are collapsed:
    //
    // - hide corresponding splitter
    //
    // - if conversations are collapsed, user is no longer keeping an
    //   eye on "current" conversation, so inform the contacts subsystem
    //   about this.
    //
    // - if conversation frame was receiving input, take input away
    //   from it, back to the content area

    frameFor('conversations').addEventListener('collapse', function(event) {
        if(event.target != frameFor('conversations'))
            return;

        var xulFrame = event.target;

        // If frame is collapsed, hide corresponding splitter
        xulFrame.previousSibling.hidden = xulFrame.collapsed;

        if(xulFrame.collapsed) {
            viewFor('contacts').nowTalkingWith(null, null);
            
            if(viewFor('conversations').isReceivingInput()) {
                var contentArea = (document.getElementById('content') ||
                                   document.getElementById('messagepane'));
                if(contentArea)
                    contentArea.focus();
                // XXX need a fallback in case no content area is recognized
            }
        } else {
            viewFor('conversations').shown();
        }
    }, false);

    // Conversations are no longer visible even when they're *area* is
    // collapsed, so take focus away in this case, too.
    
    areaFor('conversations').addEventListener('collapse', function(event) {
        if(event.target != areaFor('conversations'))
            // Event came from descendant
            return;

        var xulConversations = event.target;

        if(xulConversations.collapsed && viewFor('conversations').isReceivingInput()) {
            var contentArea = (document.getElementById('content') ||
                               document.getElementById('messagepane'));
            if(contentArea)
                contentArea.focus();
            // XXX need a fallback in case no content area is recognized
        }
    }, false);

    // Apply rules to areas
    
    var xulAreas = document.getElementsByAttribute('class', 'sameplace-area');
    
    for(var i=0; i<xulAreas.length; i++)
        xulAreas[i].addEventListener('collapse', function(event) {
            if(event.target.getAttribute('class') == 'sameplace-area') {
                // When area is collapsed, hide corresponding splitter.
                var xulArea =
                    event.target;
                var xulSplitter = document.getElementById(
                    xulArea.id.replace(/^sameplace-area/, 'sameplace-splitter'));
                xulSplitter.hidden = (event.target.collapsed);
            } else if(event.target.nodeName == 'iframe') {
                // When view is collapsed, possibly hide containing area too.
                var xulArea =
                    event.currentTarget;
                var xulContactsView =
                    xulArea.getElementsByAttribute('class', 'sameplace-contacts')[0];
                var xulConversationsView =
                    xulArea.getElementsByAttribute('class', 'sameplace-conversations')[0];
                if(xulContactsView.collapsed && xulConversationsView.collapsed)
                    collapse(xulArea);
                else
                    uncollapse(xulArea);
            }
        }, false);

    // In page context menu (if available), only display the "install
    // scriptlet" option if user clicked on what could be a scriptlet.

    var pageMenu = document.getElementById('contentAreaContextMenu');
    if(pageMenu) {
        pageMenu.addEventListener('popupshowing', function(event) {
            _('install-scriptlet').hidden = !isPossibleScriptletLink(document.popupNode);
        }, false);
    }
}

function initHotkeys() {
    var toggleContactsKey = eval(pref.getCharPref('toggleContactsKey'))
    var toggleConversationsKey = eval(pref.getCharPref('toggleConversationsKey'))

    window.addEventListener('keypress', function(event) {
        if(matchKeyEvent(event, toggleContactsKey))
            toggle();
        
        if(matchKeyEvent(event, toggleConversationsKey))
            if(!frameFor('conversations').collapsed)
                collapse(frameFor('conversations'));
    }, true);

    pref.QueryInterface(Ci.nsIPrefBranch2)
    pref.addObserver('', {
        observe: function(subject, topic, data) {
            if(topic == 'nsPref:changed') {
                switch(data) {
                case 'toggleContactsKey':
                    toggleContactsKey = eval(pref.getCharPref('toggleContactsKey'));
                    break;
                case 'toggleConversationsKey':
                    toggleConversationsKey = eval(pref.getCharPref('toggleConversationsKey'));
                    break;
                }
            }
        }
    }, false);
}

function initScriptlets() {
    scriptlets.init(['sameplace', 'scriptlets'],
                    'extensions.sameplace.',
                    'chrome://sameplace/content/scriptlet_sample.js');
    scriptlets.start();
}


// NETWORK REACTIONS
// ----------------------------------------------------------------------

function seenSharedAppNegotiation(message) {
    if(!('addTab' in getBrowser()))
        return;

    var url = message.stanza.ns_x4m_ext::share.@url;
    var xulNotify = getBrowser().getNotificationBox();
    if(!xulNotify)
        return;

    function interact(account, address, url, panel, nextAction) { // XXX duplicated
        if(account)
            dump('**** SamePlace **** Deprecation **** ' + getStackTrace() + '\n');
        if(address)
            dump('**** SamePlace **** Deprecation **** ' + getStackTrace() + '\n');

        // XXX these are set here and re-set in XMPP.connectPanel().
        // find out why it wasn't enough to set them in
        // XMPP.connectPanel() only.
        var account = panel.getAttribute('account');
        var address = panel.getAttribute('address');

        function activate() {
            XMPP.connectPanel(panel, account, address, /^javascript:/.test(url));
        }

        nextAction = nextAction || function() {};

        if(!url) {
            activate();
            nextAction();
        }
        else if(url.match(/^javascript:/)) {
            panel.loadURI(url);
            activate();
            nextAction();
        }
        else {
            afterLoad(panel, function(panel) {
                activate();
                nextAction();
            });
            panel.setAttribute('src', url);
        }
    }

    function afterLoad(panel, action) { // XXX duplicated
        // catch the load event of panel's document in capturing
        // phase. then catch the load event of the contained window in
        // bubbling phase (we can't do this before there's a window,
        // obviously.)

        panel.addEventListener('load', function(event) {
            if(event.target != panel.contentDocument)
                return;
            panel.removeEventListener('load', arguments.callee, true);
            
            // The following appears not to work if reference to
            // panel is not the one carried by event object.
            panel = event.currentTarget;
            panel.contentWindow.addEventListener('load', function(event) {
                action(panel);
            }, false);
        }, true);
    }

    function onAccept() {
        XMPP.send(message.account,
                  <message to={message.stanza.@from}>
                  <share xmlns={ns_x4m_ext} response='accept' url={url}/>
                  </message>);

        if(!(url.match(/^javascript:/) || getBrowser().currentURI.spec == 'about:blank'))
            getBrowser().selectedTab = getBrowser().addTab();
        
        var panel = getBrowser().selectedBrowser;
        panel.setAttribute('account', message.account);
        panel.setAttribute('address', XMPP.JID(message.stanza.@from).address);
        interact(null, null, url == 'current' ? null : url, panel);
    }

    function onDecline() {
        XMPP.send(message.account,
                  <message to={message.stanza.@from}>
                  <share xmlns={ns_x4m_ext} response='decline' url={url}/>
                  </message>);
    }

    if(message.direction == 'in') {
        switch(message.stanza.ns_x4m_ext::share.@response.toString()) {
        case '':
            // it's a request
            xulNotify.appendNotification(
                message.stanza.@from + ' invites you to interact on ' +
                    url + '. Do you accept?', // XXX localize
                    'sameplace-shareapp-request',
                null, xulNotify.PRIORITY_INFO_HIGH,
                [{label: 'Accept', accessKey: 'A', callback: onAccept},
                 {label: 'Decline', accessKey: 'D', callback: onDecline}]);
            break;
        case 'accept':
            xulNotify.appendNotification(
                message.stanza.@from + ' accepted to interact on ' + url,
                    'sameplace-shareapp-request',
                null, xulNotify.PRIORITY_INFO_HIGH);
            break;
        case 'decline':
            xulNotify.appendNotification(
                message.stanza.@from + ' declined to interact on ' + url,
                    'sameplace-shareapp-request',
                null, xulNotify.PRIORITY_INFO_HIGH);
            break;
        }
    }
}

function receivedAuthConfirmRequest(message) {
    var request = message.stanza;

    var response =
        <message to={request.@from}>
        <confirm xmlns={ns_http_auth}
    method={request.ns_http_auth::confirm.@method}
    url={request.ns_http_auth::confirm.@url}
    id={request.ns_http_auth::confirm.@id}/>
        </message>;

    function onDeny() {
        response.@type = 'error';
        response.error =
            <error code="401" type="auth">
            <not-authorized xmlns="urn:ietf:params:xml:xmpp-stanzas"/>
            </error>;
        XMPP.send(message.account, response);
    }

    function onAuthorize() {
        XMPP.send(message.account, response)
    }

    var userMessage = 'Someone (maybe you) tried to authenticate on ' + // XXX localize
        request.ns_http_auth::confirm.@url + ' \n' +
        'as ' + request.@to + ', with transaction ID "' +
        request.ns_http_auth::confirm.@id + '". Authorize?'

    var xulNotify = getBrowser().getNotificationBox();
    if(xulNotify) {
        xulNotify.appendNotification(
            userMessage, 'sameplace-auth-confirm',
            null, xulNotify.PRIORITY_INFO_HIGH,
            [{label: 'Confirm', accessKey: 'C', callback: onAuthorize},
             {label: 'Deny', accessKey: 'D', callback: onDeny}]);
    } else {
        if(window.confirm(userMessage))
            onAuthorize();
        else
            onDeny();
    }
}


// GUI REACTIONS
// ----------------------------------------------------------------------

function showingMainMenu(event) {
    var toggleContactsKey = eval(pref.getCharPref('toggleContactsKey'));
    var label = _('command-toggle').getAttribute('label');
    _('command-toggle').setAttribute(
        'label', label.replace(/\((.+?)\)/,
                               '(' + keyDescToKeyRepresentation(toggleContactsKey) + ')'));
}

function selectedAccount(event) {
    var accountJid = event.target.value;
    if(XMPP.isUp(accountJid))
        XMPP.down(accountJid);
    else
        XMPP.up(accountJid);
}

function requestedInstallScriptlet(domElement) {
    if(!isPossibleScriptletLink(domElement))
        return;

    var scriptletManager = window.openDialog(
        'chrome://sameplace/content/scriptlet_manager.xul',
        'sameplace-scriptlet-manager', '',
        scriptlets);
    
    scriptletManager.addEventListener('load', function(event) {
        scriptletManager.removeEventListener(
            'load', arguments.callee, false);

        if(!scriptletManager.requestedInstallRemoteScriptlet(domElement.href))
            scriptletManager.close();
    }, false);
}


// GUI ACTIONS
// ----------------------------------------------------------------------

function checkNoScript() {
    var noScriptUpdateItem = Cc['@mozilla.org/extensions/manager;1']
        .getService(Ci.nsIExtensionManager)
        .getItemForID('{73a6fe31-595d-460b-a920-fcc0f8843232}');
    // In Firefox2, an updateItem is always returned, even for
    // non-installed apps, so we use the name test to check if
    // NoScript is installed for real.
    if(noScriptUpdateItem && noScriptUpdateItem.name != '')
        window.alert("Warning: you are using NoScript.  You'll be able to configure\nSamePlace, but chats will be blocked.\n\nTo fix this, remember to allow scripts from file:// URLs to run."); // localize
}

function openPreferences(paneID) {
    var instantApply;
    try {
        instantApply = pref.getBoolPref('browser.preferences.instantApply', false);
    } catch(e) {
        instantApply = false;
    }
        
    var features = 'chrome,titlebar,toolbar,centerscreen' +
        (instantApply ? ',dialog=no' : ',modal');
    
    var wm = Cc['@mozilla.org/appshell/window-mediator;1']
        .getService(Ci.nsIWindowMediator);

    var win = wm.getMostRecentWindow('SamePlace:Preferences');
    
    if(win) {
        win.focus();
        if(paneID) {
            var pane = win.document.getElementById(paneID);
            win.document.documentElement.showPane(pane);
        }
    } else {
        window.openDialog('chrome://sameplace/content/preferences.xul',
                          'SamePlace Preferences', features, paneID);
    }
}

function collapse(element) {
    if(element.collapsed)
        return;

    element.collapsed = true;
    fireSimpleEvent(element, 'collapse');
}

function uncollapse(element) {
    if(!element.collapsed)
        return;

    element.collapsed = false;
    fireSimpleEvent(element, 'collapse');
}

function fireSimpleEvent(element, eventName) {
    var event = document.createEvent('Event');
    event.initEvent(eventName, true, false);
    element.dispatchEvent(event);
}

if(experimentalMode()) {
    function seenDisplayableMessage(message) {
        if(!_('button'))
            return;
        if(isCompact() || isCollapsed())
            _('button').setAttribute('pending-messages', 'true');
    }

    function isCompact() {
        return _('box').width == _('box').getAttribute('minwidth');
    }

    function isCollapsed() {
        return _('box').collapsed;
    }

    function expand() {
        _('box').width = _('box').__restore_width;
    }

    function toggle() {
        if(_('box').collapsed) {
            _('box').collapsed = false;
            if(_('box').__restore_width)
                expand();
            if(_('button'))
                _('button').removeAttribute('pending-messages');
        } else if(isCompact()) {
            _('box').collapsed = true;
        } else {
            _('box').__restore_width = _('box').width;
            _('box').width = _('box').getAttribute('minwidth');
            if(_('button'))
                _('button').removeAttribute('pending-messages');
        }     
    }
} else {
    function toggle(event) {
        if(areaFor('contacts').collapsed)
            uncollapse(areaFor('contacts'));
        else
            collapse(areaFor('contacts'));

        if(!areaFor('contacts').collapsed) {
            uncollapse(frameFor('contacts'));
            uncollapse(frameFor('toolbox'));
        }
    }    
}

function runWizard() {
    window.openDialog(
        'chrome://sameplace/content/wizard.xul',
        'sameplace-wizard', 'chrome')
}

function loadAreas(force) {
    if(experimentalMode()) {
        if(force || _('frame').contentDocument.location.href != 'chrome://sameplace/content/experimental/contacts.xul')
            _('frame').contentDocument.location.href = 'chrome://sameplace/content/experimental/contacts.xul';
    } else {
        // XXX this does not handle "appcontent" setting as a conversation area
        if(force || viewFor('conversations').location.href != 'chrome://sameplace/content/sameplace.xul')
            viewFor('conversations').location.href = 'chrome://sameplace/content/sameplace.xul';
        if(force || viewFor('contacts').location.href != 'chrome://sameplace/content/contacts.xul') 
            viewFor('contacts').location.href = 'chrome://sameplace/content/contacts.xul';
        if(force || viewFor('toolbox').location.href != 'chrome://sameplace/content/toolbox.xul') 
            viewFor('toolbox').location.href = 'chrome://sameplace/content/toolbox.xul';
    }
}


// OTHER ACTIONS
// ----------------------------------------------------------------------

function experimentalMode() {
    try {
        return pref.getBoolPref('experimental');
    } catch(e) {
        return false;
    }
}


// GUI UTILITIES
// ----------------------------------------------------------------------

function collapse(element) {
    if(element.collapsed)
        return;

    element.collapsed = true;
    fireSimpleEvent(element, 'collapse');
}

function uncollapse(element) {
    if(!element.collapsed)
        return;

    element.collapsed = false;
    fireSimpleEvent(element, 'collapse');
}

function fireSimpleEvent(element, eventName) {
    var event = document.createEvent('Event');
    event.initEvent(eventName, true, false);
    element.dispatchEvent(event);
}

function _(id) {
    return document.getElementById('sameplace-' + id);
}

function isPossibleScriptletLink(domElement) {
    if(!('href' in domElement))
        return false;
    if(!domElement.href.match(/\.js$/))
        return false;

    return true;
}

function isReceivingInput() {
    return (viewFor('conversations').isReceivingInput() ||
            (document.commandDispatcher.focusedElement &&
             document.commandDispatcher.focusedElement == viewFor('toolbox').document))
}

function areaFor(aspect) {
    switch(aspect) {
    case 'contacts':
    case 'toolbox':
        return _('area-' + pref.getCharPref('contactsArea'));
        break;
    case 'conversations':
        switch(pref.getCharPref('conversationsArea')) {
        case 'left':
        case 'right':
        case 'sidebar':
            return _('area-' + pref.getCharPref('conversationsArea'));
            break;
        case 'appcontent':
            // Returning 'area-left' as a proxy.  Conversations will
            // be in the appcontent area, but conversation handling
            // code will be hosted in a window loaded in the
            // 'area-left'.
            return _('area-left');
            break;
        default:
            throw new Error('Invalid argument. (' + pref.getCharPref('conversationsArea') + ')');
        }
        break;
    default:
        throw new Error('Invalid argument. (' + aspect + ')');
    }
}

function frameFor(aspect) {
    if(['toolbox', 'contacts', 'conversations'].indexOf(aspect) == -1)
        throw new Error('Invalid argument. (' + aspect + ')');

    var xulArea = areaFor(aspect);
    if(xulArea.id == 'appcontent')
        return getBrowser().contentWindow;
    else
        return xulArea.getElementsByAttribute(
            'class', 'sameplace-' + aspect)[0];
}

function viewFor(aspect) {
    return frameFor(aspect).contentWindow;
}


// UTILITIES
// ----------------------------------------------------------------------

function openURL(url) {
    if(typeof(getBrowser().addTab) == 'function')
        // XXX bard: apparently needed otherwise it won't have any
        // effect when called from an onload handler
        setTimeout(function() {
            getBrowser().selectedTab = getBrowser().addTab(url)
        }, 500);
    else
        Cc['@mozilla.org/uriloader/external-protocol-service;1']
            .getService(Ci.nsIExternalProtocolService)
            .loadUrl(Cc['@mozilla.org/network/io-service;1']
                     .getService(Ci.nsIIOService)
                     .newURI(url, null, null));
}

function load(url, context) {
    var loader = Cc['@mozilla.org/moz/jssubscript-loader;1']
        .getService(Ci.mozIJSSubScriptLoader);

    if(!context)
        // load everything in current context
        loader.loadSubScript(url);
    else if(arguments.length == 2) {
        // load everything in specified context and also return it
        loader.loadSubScript(url, context);
        return context;
    } else {
        // load some things in current or specified context
        context = context || this;
        var tmpContext = {};
        loader.loadSubScript(url, tmpContext);
        for each(var name in Array.slice(arguments, 2)) {
            this[name] = tmpContext[name];
        }
        return context;
    }
}

function matchKeyEvent(e1, e2) {
    return (e1.ctrlKey  == e2.ctrlKey &&
            e1.shiftKey == e2.shiftKey &&
            e1.altKey   == e2.altKey &&
            e1.metaKey  == e2.metaKey &&
            e1.charCode == e2.charCode &&
            e1.keyCode  == KeyEvent[e2.keyCodeName]);
}

function getMostRecentWindow() {
    return Cc['@mozilla.org/appshell/window-mediator;1']
    .getService(Ci.nsIWindowMediator)
    .getMostRecentWindow('');
}

function isActive() {
    return viewFor('contacts').document.location.href == 'chrome://sameplace/content/contacts.xul';
}

function isActiveSomewhere() {
    var windows = Cc['@mozilla.org/appshell/window-mediator;1']
    .getService(Ci.nsIWindowMediator)
    .getEnumerator('');

    while(windows.hasMoreElements()) {
        var window = windows.getNext();
        if(window.sameplace && window.sameplace.isActive())
            return true;
    }
    return false;
}

function isPopupWindow() {
    return !window.toolbar.visible;
}

function upgradeCheck(id, versionPref, actions, ignoreTrailingParts) {
    const pref = Cc['@mozilla.org/preferences-service;1']
    .getService(Ci.nsIPrefService);

    function getExtensionVersion(id) {
        return Cc['@mozilla.org/extensions/manager;1']
        .getService(Ci.nsIExtensionManager)
        .getItemForID(id).version;
    }

    function compareVersions(a, b) {
        return Cc['@mozilla.org/xpcom/version-comparator;1']
        .getService(Ci.nsIVersionComparator)
        .compare(a, b);
    }

    var curVersion = getExtensionVersion(id);
    if(curVersion) {
        var prevVersion = pref.getCharPref(versionPref);
        if(prevVersion == '') {
            if(typeof(actions.onFirstInstall) == 'function')
                actions.onFirstInstall();
        } else {
            if(compareVersions(
                (ignoreTrailingParts ?
                 curVersion.split('.').slice(0, -ignoreTrailingParts).join('.') :
                 curVersion),
                prevVersion) > 0)
                if(typeof(actions.onUpgrade) == 'function')
                    actions.onUpgrade();
        }

        pref.setCharPref(versionPref, curVersion);
    }
}

// Duplicated from sameplace_preferences_impl.js

function keyDescToKeyRepresentation(desc) {
    var modifiers = {
        ctrlKey  : 'Control',
        shiftKey : 'Shift',
        altKey   : 'Alt',
        metaKey  : 'Meta'
    };

    var repres = [];
    
    for(var name in modifiers)
        if(desc[name])
            repres.push(modifiers[name]);

    if(desc.charCode)
        repres.push(String.fromCharCode(desc.charCode))
    else if(desc.keyCodeName)
        repres.push(desc.keyCodeName.replace(/^DOM_VK_/, ''))

    return repres.join('+');
}