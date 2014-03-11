/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// IMPORTANT: This server uses *none* of the code in the client library.
//            It must be portable to other languages.

var WebSocket = require('ws');
var WebSocketServer = WebSocket.Server;
var Static = require('node-static');
var Http = require('http');
var PORT = 8080;

var REGISTER     = 0;
var REGISTER_ACK = 1;
var PATCH        = 2;

var parseMessage = function (msg) {
    var passLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(passLen.length+1);
    var pass = msg.substring(0,Number(passLen));
    msg = msg.substring(pass.length);

    var unameLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(unameLen.length+1);
    var userName = msg.substring(0,Number(unameLen));
    msg = msg.substring(userName.length);

    var channelIdLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(channelIdLen.length+1);
    var channelId = msg.substring(0,Number(channelIdLen));
    msg = msg.substring(channelId.length);

    var contentStrLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(contentStrLen.length+1);
    var contentStr = msg.substring(0,Number(contentStrLen));

    return {
        user: userName,
        pass: pass,
        channelId: channelId,
        content: JSON.parse(contentStr)
    };
};

// get the password off the message before sending it to other clients.
var popPassword = function (msg) {
    var passLen = msg.substring(0,msg.indexOf(':'));
    return msg.substring(passLen.length+1 + Number(passLen));
};

var dropClient = function (ctx, userpass) {
    var client = ctx.registeredClients[userpass];
    if (client.socket.readyState !== WebSocket.CLOSING
        && client.socket.readyState !== WebSocket.CLOSED)
    {
        try {
            client.socket.close();
        } catch (e) {
            console.log("Failed to disconnect ["+client.userName+"], attempting to terminate");
            try {
                client.socket.terminate();
            } catch (ee) {
                console.log("Failed to terminate ["+client.userName+"]  *shrug*");
            }
        }
    }

    for (var i = 0; i < client.channels.length; i++) {
        var chanName = client.channels[i];
        var chan = ctx.channels[chanName];
        var idx = chan.indexOf(client);
        if (idx < 0) { throw new Error(); }
        console.log("Removing ["+client.userName+"] from channel ["+chanName+"]");
        chan.splice(idx, 1);
        if (chan.length === 0) {
            console.log("Removing empty channel ["+chanName+"]");
            delete ctx.channels[chanName];
        }
    }
    delete ctx.registeredClients[userpass];
};

var handleMessage = function (ctx, socket, msg) {
    var parsed = parseMessage(msg);
    var userPass = parsed.user + ':' + parsed.pass;
    if (ctx.authorizedUsers.indexOf(userPass) === -1) {
        throw new Error("unauthorized");
    }

    msg = popPassword(msg);

    if (parsed.content[0] === REGISTER) {
if (ctx.registeredClients[userPass]) {
    throw new Error("[" + userPass + "] already registered");
}
console.log("[" + userPass + "] registered");
        var client = ctx.registeredClients[userPass] = ctx.registeredClients[userPass] || {
            channels: [],
            userName: parsed.user
        };
        client.channels.push(parsed.channelId);
        if (client.socket && client.socket !== socket) { client.socket.close(); }
        client.socket = socket;

        var chan = ctx.channels[parsed.channelId] = ctx.channels[parsed.channelId] || [];
        chan.messages = chan.messages || [];
        chan.push(client);

        socket.send('0:' + parsed.channelId.length + ':' + parsed.channelId + '5:[1,0]');
        for (var i = 0; i < chan.messages.length; i++) {
console.log(chan.messages[i]);
            socket.send(chan.messages[i]);
        }
        return;
    }

    var client = ctx.registeredClients[userPass];
    if (typeof(client) === 'undefined') { throw new Error('unregistered'); }

    var channel = ctx.channels[parsed.channelId];
    if (typeof(channel) === 'undefined') { throw new Error('no such channel'); }

    if (channel.indexOf(client) === -1) { throw new Error('client not in channel'); }

    channel.messages.push(msg);

    channel.forEach(function (user) {
        try {
            user.socket.send(msg);
        } catch (e) {
            console.log(e.stack);
            dropClient(ctx, userPass);
        }
    });
};

var main = function () {

    var file = new Static.Server('../');

    var authorizedUsers = [];

    var httpServ = Http.createServer(function (request, response) {
        request.addListener('end', function () {
            if (request.url.indexOf('/getToken') === 0) {
                var user = Math.random().toString(16).substring(2);
                var pass = Math.random().toString(16).substring(2);
                authorizedUsers.push(user + ':' + pass);
                response.writeHead(200, {"Content-Type": "text/javascript"});
                // add a - here to prevent jquery from doing soemthing magical
                // because the content is valid json
                response.write('-'+JSON.stringify({user:user,pass:pass}));
                response.end();
            }
            file.serve(request, response);
        });
    });

    httpServ.listen(PORT);
    console.log("Navigate your favorite web browser to http://127.0.0.1:8081/");

    var ctx = {
        socketServer: wss = new WebSocketServer({server: httpServ}),
        registeredClients: {},
        channels: {},
        authorizedUsers: authorizedUsers
    };

    wss.on('connection', function(socket) {
        socket.on('message', function(message) {
            try {
                handleMessage(ctx, socket, message);
            } catch (e) {
                console.log(e.stack);
                socket.close();
            }
        });
        socket.on('close', function (evt) {
            for (client in ctx.registeredClients) {
                if (ctx.registeredClients[client].socket === socket) {
                    dropClient(ctx, client);
                }
            }
        });
    });    
};

main();
