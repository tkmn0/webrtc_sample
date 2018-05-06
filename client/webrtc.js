const localVideo = document.getElementById('local_video');
const remoteVideo = document.getElementById('remote_video');
const textForSendSdp = document.getElementById('text_for_send_sdp');
const textToReceiveSdp = document.getElementById('text_for_receive_sdp');
let localStream = null;
let peerConnection = null;
let negotiationneededCounter = 0;
let isOffer = false;

// ---- ボタンのアクション--- 
/**
 * mediaを取得する
 */
function startVideo() {
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
 * @param {any} element html video/audio element
 * @param {any} stream video/audio stream
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
 * @param {document.element} element 
 */
function cleanupVideoElement(element) {
    element.pause();
    element.srcObject = null;
}
/**
 * Receive remote SDPボタンが押されたらOffer側とAnswer側で処理を分岐
 */
function onSdpText() {
    const text = textToReceiveSdp.value;
    if (peerConnection) {
        console.log('Received answer text...');
        const answer = new RTCSessionDescription({
            type: 'answer',
            sdp: text,
        });
        setAnswer(answer);
    }
    else {
        console.log('Received offer text...');
        const offer = new RTCSessionDescription({
            type: 'offer',
            sdp: text,
        });
        setOffer(offer);
    }
    textToReceiveSdp.value = '';
}

/** WebRTC handling **/
/**
 * WebRTCを利用する準備をする
 * @param {any} isOffer 
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
            console.log(evt.candidate);
        } else {
            console.log('empty ice event');
            sendSdp(peer.localDescription);
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
        console.warn('no local stream, but continue.');
    }

    return peer;
}

/**
 * 手動シグナリングのための処理を追加する
 * @param {RTCSessionDescription} sessionDescription 
 */
function sendSdp(sessionDescription) {
    console.log('---sending sdp ---');
    textForSendSdp.value = sessionDescription.sdp;
    textForSendSdp.focus();
    textForSendSdp.select();
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

/**
 * Offer側のSDPをセットする処理
 * @param {RTCSessionDescription} sessionDescription 
 */
function setOffer(sessionDescription) {
    if (peerConnection) {
        console.error('peerConnection already exist!');
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
            console.error('setRemoteDescription(answer) ERROR: ', err);
        });
}