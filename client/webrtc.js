const localVideo = document.getElementById('local_video');
const remoteVideo = document.getElementById('remote_video');
const textForSendSdp = document.getElementById('text_for_send_sdp');
const textToReceiveSdp = document.getElementById('text_for_receive_sdp');
let localStream = null;
let peerConnection = null;
let negotiationneededCounter = 0;
let isOffer = false;

// シグナリングサーバーの設定
const wsURL = 'ws://ec2-13-114-44-110.ap-northeast-1.compute.amazonaws.com:3001/'
const ws = new WebSocket(wsURL);

//** ボタンのアクション **// 
/**
 * mediaを取得する
 */
function startVideo() {
    // constraints: ここで解像度(の範囲)を決めることもできる
    // ハウリング対策のため、audioをfalseにしてます。
    const mediaConstraints = { video: true, audio: false };
    navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then(function (stream) {
            localStream = stream;
            playVideo(localVideo, stream);

        })
        .catch(function (error) {
            console.log('error: ' + error);
        });
}
/**
 * Videoの再生を開始する
 * @param {HTMLMediaElement} element html video/audio element
 * @param {MediaStream} stream video/audio stream
 */
function playVideo(element, stream) {
    element.srcObject = stream;
    element.play();
}
/**
 * P2P通信を切断する
 */
function hangUp() {
    if (peerConnection) {
        if (peerConnection.iceConnectionState !== 'closed') {
            peerConnection.close();
            peerConnection = null;
            negotiationneededCounter = 0;
            cleanupVideoElement(remoteVideo);
            textForSendSdp.value = '';
            return;
        }
    }
    console.log('peerConnection is closed.');
}
/**
 * ビデオエレメントを初期化する
 * 
 * @param {HTMLMediaElement} element 
 */
function cleanupVideoElement(element) {
    element.pause();
    element.srcObject = null;
}

/** WebSocket handling ***/
ws.onopen = (evt) => {
    console.log('ws open()');
};
ws.onerror = (err) => {
    console.error('ws onerror() ERR:', err);
};
ws.onmessage = (evt) => {
    console.log('ws onmessage() data:', evt.data);
    const message = JSON.parse(evt.data);
    console.log('recieved message: ' + message.type);
    switch (message.type) {
        case 'offer': {
            console.log('Received offer ...');
            textToReceiveSdp.value = message.sdp;
            setOffer(message);
            break;
        }
        case 'answer': {
            console.log('Received answer ...');
            textToReceiveSdp.value = message.sdp;
            setAnswer(message);
            break;
        }
        case 'candidate': {
            console.log('Received ICE candidate ...');
            const candidate = new RTCIceCandidate(message.ice);
            console.log(candidate);
            addIceCandidate(candidate);
            break;
        }
        case 'close': {
            console.log('peer is closed ...');
            hangUp();
            break;
        }
        default: {
            console.log("Invalid message");
            break;
        }
    }
};

/** WebRTC handling **/
/**
 * WebRTCを利用する準備をする
 * @param {boolean} isOffer 
 * @returns RTCPeerConnection with callback events
 */
function prepareNewConnection(isOffer) {
    // Googleが公開しているSTUNサーバーをしていする
    const pc_config = { "iceServers": [{ "urls": "stun:stun.webrtc.ecl.ntt.com:3478" }] };
    const peer = new RTCPeerConnection(pc_config);

    // MARK: peerconnectionのコールバックを設定 
    // リモートのMediStreamTrackを受信した時
    peer.ontrack = evt => {
        console.log('-- peer.ontrack()');
        playVideo(remoteVideo, evt.streams[0]);
    };

    // ICE Candidateを収集したときのイベント
    peer.onicecandidate = evt => {
        if (evt.candidate) {
            // Trickle ICE
            console.log(evt.candidate);
            sendICECandidate(evt.candidate);
        } else {
            // Vanilla ICE
            console.log('empty ice event');
        }
    };

    // Offer側でネゴシエーションが必要になったときの処理
    peer.onnegotiationneeded = function () {
        if (isOffer) {
            makeOffer(peer);
        }
    }

    // ICEのステータスが変更になったときの処理
    peer.oniceconnectionstatechange = function () {
        console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
        switch (peer.iceConnectionState) {
            case 'closed':
            case 'failed':
                if (peerConnection) {
                    hangUp();
                }
                break;
            case 'dissconnected':
                break;
        }
    };

    // ローカルのMediaStreamを利用できるようにする
    if (localStream) {
        console.log('Adding local stream...');
        localStream.getTracks().forEach(track => peer.addTrack(track, localStream));
    } else {
        // この場合、localのstreamがないため、通信できるSDPが生成されない
        console.warn('no local stream, but continue.');
    }

    return peer;
}

//** SDP/ICE sending */
/**
 * WebSocket経由でSDPを送る
 * @param {RTCSessionDescription} sessionDescription 
 */
function sendSdp(sessionDescription) {
    console.log('---sending sdp ---');
    textForSendSdp.value = sessionDescription.sdp;
    const message = JSON.stringify(sessionDescription);
    console.log('sending SDP=' + message);
    ws.send(message);
}
/**
 * WebSocket経由でICECandidateを送る
 * @param {RTCIceCandidate} candidate 
 */
function sendICECandidate(candidate) {
    console.log('---sending ICE candidate ---');
    const message = JSON.stringify({ type: 'candidate', ice: candidate });
    console.log('sending candidate=' + message);
    ws.send(message);
}

/**
 * Connectボタンが押されたらWebRTCのOffer処理を開始
 */
function connect() {
    if (!peerConnection) {
        console.log('make Offer');
        peerConnection = prepareNewConnection(true);
    }
    else {
        console.warn('peer already exist.');
    }
}

/** make SDP **/
/**
 * Answer SDPを生成する
 */
function makeAnswer() {
    console.log('sending Answer. Creating remote session description...');
    if (!peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.createAnswer()
        .then(function (sessionDescription) {
            peerConnection.setLocalDescription(sessionDescription)
                .then(function () {
                    console.log('setLocalDescription() succsess in promise');
                    sendSdp(peerConnection.localDescription);
                })
                .catch(function (error) {
                    console.log('error to set local answer SDP');
                });
        })
        .catch(function (error) {
            console.log('error to create answer: ' + error);
        });
}
/**
 * Offer SDPを作成する
 * @param {RTCPeerConnection} peer RTCPeerConnection
 */
function makeOffer(peer) {
    peer.createOffer()
        .then(function (sessionDescription) {
            console.log('createOffer() succsess in promise');
            peer.setLocalDescription(sessionDescription)
                .then(function (succsess) {
                    console.log('setLocalDescription() succsess in promise');
                    sendSdp(peer.localDescription);
                })
                .catch(function (error) {
                    console.log('error in set local description: ' + error);
                });
        })
        .catch(function (error) {
            console.log('create offer error: ' + error);
        });
}

/** set SDP **/
/**
 * Offer側のSDPをセットする処理
 * @param {RTCSessionDescription} sessionDescription 
 */
function setOffer(sessionDescription) {
    if (peerConnection) {
        console.log('peerConnection already exist!');
        return;
    }
    peerConnection = prepareNewConnection(false);
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function () {
            console.log('setRemoteDescription(answer) succsess in promise');
            makeAnswer();
        })
        .catch(function (error) {
            console.error('setRemoteDescription(offer) ERROR: ', err);
        });
}
/**
 * Answer側のSDPをセットする場合
 * @param {RTCSessionDescription} sessionDescription 
 * @returns 
 */
function setAnswer(sessionDescription) {
    if (!peerConnection) {
        console.error('peerConnection NOT exist!');
        return;
    }
    peerConnection.setRemoteDescription(sessionDescription)
        .then(function () {
            console.log('setRemoteDescription(answer) succsess in promise');
        })
        .catch(function (error) {
            console.error('setRemoteDescription(answer) ERROR: ', error);
        });
}

//** add ICE **/
/**
 * ICE candaidate受信時にセットする
 * @param {RTCIceCandidate} candidate 
 */
function addIceCandidate(candidate) {
    if (peerConnection) {
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.error('PeerConnection not exist!');
        return;
    }
}