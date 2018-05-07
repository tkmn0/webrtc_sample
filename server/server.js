"use strict";

let WebSocketServer = require('ws').Server;
let port = 3001;
let wsServer = new WebSocketServer({ port: port });
console.log('websocket server start. port=' + port);

wsServer.on('connection', function (ws) {
    console.log('-- websocket connected --');
    const roomID = getRandomString();
    const message = JSON.stringify({ type: 'room', id: roomID });
    ws.send(message);
    console.log(roomID);
    ws.id = roomID;

    ws.on('message', function (message) {
        console.log('-- message recieved --');
        const json = JSON.parse(message.toString());
        if(json.type == 'roomID'){
            console.log('-- got room id --');
            console.log(json.id);
            ws.id = json.id;
        }
        wsServer.clients.forEach(function each(client) {
            if (isSame(ws, client)) {
                console.log('- skip sender -');
            }
            else if(ws.id == client.id){
                client.send(message);
            }
        });
    });

});

function isSame(ws1, ws2) {
    // -- compare object --
    return (ws1 === ws2);
}

function getRandomString() {
    var l = 8;
    var c = "abcdefghijklmnopqrstuvwxyz0123456789";
    var cl = c.length;
    var r = "";
    for (var i = 0; i < l; i++) {
        r += c[Math.floor(Math.random() * cl)];
    }
    return r;
}