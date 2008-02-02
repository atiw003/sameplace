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
 * The interactive user interfaces in modified source and object code
 * versions of this program must display Appropriate Legal Notices, as
 * required under Section 5 of the GNU General Public License version 3.
 *
 * In accordance with Section 7(b) of the GNU General Public License
 * version 3, modified versions must display the "Powered by SamePlace"
 * logo to users in a legible manner and the GPLv3 text must be made
 * available to them.
 * 
 * Author: Massimiliano Mirra, <bard [at] hyperstruct [dot] net>
 *  
 */

var request;

function init() {
    request = window.arguments[0];
    
    var xulContacts = document.getElementById('contacts');
    for each(var [account, address, preSelected] in request.contacts) {
        var xulContact = document.createElement('listitem');
        xulContact.setAttribute('type', 'checkbox');
        xulContact.setAttribute('value', account + '\0' + address);
        xulContact.setAttribute('label', address);
        xulContact.setAttribute('checked', preSelected);
        xulContact.setAttribute('tooltiptext', 'Via ' + account);
        xulContacts.appendChild(xulContact);
    }

    document.getElementById('description').textContent = request.description;
}


function chosenOk() {
    request.choice = true;
}

function chosenCancel() {
    request.choice = false;
}