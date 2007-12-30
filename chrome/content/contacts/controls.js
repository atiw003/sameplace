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


var scroller = {
    init: function(xulScroller, xulTarget) {
        this._inccrement = 0;
        this._xulScroller = xulScroller;
        this._xulTarget = xulTarget;
    },

    set increment(val) {
        this._increment = val;
    },

    scroll: function(increment) {
        if(this._scrolling)
            return;
        if(increment)
            this._increment;

        var scroller = this;
        function step() {
            if(!scroller._scrolling)
                return;
            scroller._xulTarget.scrollBoxObject.scrollBy(0, scroller._increment);
            window.setTimeout(step, 40)
        }
        
        this._scrolling = true;
        step();
    },
    
    stop: function() {
        this._scrolling = false;
    },
    
    mouseMovedOnScrollDown: function(event) {
        scroller.scroll();
    },

    mouseMovedOnScrollUp: function(event) {
        scroller.scroll();
    },

    mouseLeftScroller: function(event) {
        scroller.stop();
    },

    update: function() {
        var xulContacts = this._xulTarget;
        var xulScroller = this._xulScroller;
        var xulScroller = $('#controls');
        var scrollPosY = {};
        var scrollHeight = {};

        xulContacts.scrollBoxObject.getPosition({}, scrollPosY);
        xulContacts.scrollBoxObject.getScrolledSize({}, scrollHeight);

        if(scrollPosY.value == 0)
            removeClass(xulScroller, 'more-up');
        else
            addClass(xulScroller, 'more-up');

        if(scrollHeight.value <= scrollPosY.value + xulContacts.boxObject.height) 
            removeClass(xulScroller, 'more-down');
        else
            addClass(xulScroller, 'more-down');
    },

    _scrolling: false,
};

window.addEventListener('load', function(event) {
    channel.on({
        event: 'connector'
    }, function(connector) {
        switch(connector.state) {
        case 'active':
            $('.control.offline-notice').hidden = true;
            break;
        case 'disconnected':
            if(XMPP.accounts.every(XMPP.isDown))
                $('.control.offline-notice').hidden = false;
            break;
        }
    });

    channel.on({
        event : 'connector',
        state : 'disconnected'
    }, updatePresenceIndicator);

    channel.on({
        event     : 'presence',
        direction : 'out',
        stanza    : function(s) {
            return s.@type == undefined && s.ns_muc::x == undefined;
        }
    }, updatePresenceIndicator);

    scroller.init($('#controls'), $('#contacts'));

    $('.control.offline-notice').hidden = XMPP.accounts.some(XMPP.isUp);

    updatePresenceIndicator();
}, false);

// GUI ACTIONS
// ----------------------------------------------------------------------

function updatePresenceIndicator() {
    var xulStatus = $('.dock-tools .icon.presence-indicator');

    var summary = XMPP.presenceSummary(); // XXX should be ported to presencesOf(account);
    xulStatus.setAttribute('availability',
                           summary.stanza.@type.toString() || 'available');
    xulStatus.setAttribute('show',
                           summary.stanza.show.toString());
}


// GUI REACTIONS
// ----------------------------------------------------------------------

window.addEventListener('resize', function(event) {
    // These appear not to work if set via CSS
    if(document.width <= COMPACT_WIDTH) {
        $('#controls-upper').setAttribute('orient', 'vertical');
        $('#controls-upper').setAttribute('align', '');
    } else {
        removeClass($('#view'), 'compact');
        $('#controls-upper').setAttribute('orient', 'horizontal');
        $('#controls-upper').setAttribute('align', 'start');
    }
}, false);

function hoveredDockContent(event) {
    if(hasClass(event.target, 'icon')) {
        var tooltip = $(event.target, '^ .control .inline-tooltip');
        tooltip.firstChild.value = event.target.getAttribute('helptext');
        tooltip.hidden = false;
    }
}

function requestedToggleFilter() {
    var xulFieldBox = $('#controls .field.filter');
    if(xulFieldBox.collapsed) {
        xulFieldBox.collapsed = false;
        xulFieldBox.firstChild.focus();        
    } else {
        xulFieldBox.collapsed = true;
        xulFieldBox.focus();
    }
}

function focusedFilterField(xulTextbox) {
    xulTextbox.select();
    addClass($(xulTextbox, '^ .control'), 'active');
}

function blurredFilterField(xulTextbox) {
    removeClass($(xulTextbox, '^ .control'), 'active');
}

function inputInFilterField(field) {
    requestedFilter(field.value);
}

function keypressInInputField(event) {
    if(event.keyCode == KeyEvent.DOM_VK_ESCAPE) {
        var xulTextbox = event.target;
        event.preventDefault();
        requestedFilter('');
        xulTextbox.value = 'Type part of nick…';
        xulTextbox.parentNode.focus();
        xulTextbox.parentNode.collapsed = true;
    } else if(event.keyCode == KeyEvent.DOM_VK_DOWN) {
        $('#contacts').selectedItem = 
            $('#contacts .contact[selected="true"] + [candidate="true"][availability="available"]');
    } else if(event.keyCode == KeyEvent.DOM_VK_UP) {
        $('#contacts').selectedItem = 
            $('#contacts .contact[selected="true"] - [candidate="true"][availability="available"]');
    } else if(event.keyCode == KeyEvent.DOM_VK_RETURN) {
        var xulContact = $('#contacts').selectedItem;
        if(xulContact) {
            var xulTextbox = event.target;
            event.preventDefault();
            requestedFilter('');
            xulTextbox.value = 'Type part of nick…';
            xulTextbox.parentNode.focus();
            xulTextbox.parentNode.collapsed = true;

            $('#contacts').selectedIndex = -1;

            var selectEvent = document.createEvent('Event');
            selectEvent.initEvent('contact/select', true, false);
            xulContact.dispatchEvent(selectEvent); // XXX duplicated from clickedContact
        }
    }
}