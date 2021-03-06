/*
 * author chuckfairy http://chuckfairy.com/
 * thanks to https://github.com/antimatter15/whammy
 */

THREE.WebMExporter = function( options ) {

    options = typeof(options) === "object" ? options : {};

    //Video Options

    this.speed = options.speed || 15;

    this.duration = 1000 / this.speed;

    this.quality = (options.quality) ? (options.quality - 0.0) / 100 : 1;


    //Renderering and scene options

    //WebGL Renderer must have set preserveDrawingBuffer = true

    this.renderer = options.renderer;

    this.scene = options.scene;

    this.camera = options.camera;

};

THREE.WebMExporter.prototype = {

    constructor: THREE.WebMExporter,

    REVISION: 2,


    //Frame array to compile

    frames: [ ],


    //add a render frame from set render scene

    addRenderFrame: function(duration) {

        this.renderer.render(this.scene, this.camera);

        this.addFrame(this.renderer.domElement, duration);

    },


    //add a canvas outputted dataUrl

    addFrame: function( frame, duration ) {

        //retrieve dataURL from canvas
        if('toDataURL' in frame){
            frame = frame.toDataURL('image/webp', this.quality);
        }

        else if(typeof frame != "string"){
            throw "frame must be a a CanvasElement or a DataURI formatted string";
        }

        if (!(/^data:image\/webp;base64,/ig).test(frame)) {
            throw "Input must be formatted properly as a base64 encoded DataURI of type image/webp";
        }

        this.frames.push({
            image: frame,
            duration: (duration || this.duration)
        });

    },


    //Set quality of images 1-100

    setQuality: function( quality ) {

        this.quality = (quality - 0.0) / 100;

    },


    //Set speed in fps

    setSpeed: function( speed ) {

        this.speed = (speed - 0.0);
        this.duration = 1000 / this.speed;

    },


    //Compile to WebM video

    compile: function() {

        var t = this;
        var frameLength = t.frames.length;
        var webp = [];
        var width, height, duration;

        for( var i = 0; i < frameLength; i++ ) {

            var frame = t.frames[i];
            var output = t.parseWebP(t.parseRIFF(atob(frame.image.slice(23))));
            output.duration = frame.duration;
            webp[i] = output;

            if( i === 0 ) {
                width = output.width;
                height = output.height;
                duration = output.duration;
            }

            if( output.width !== width ) {
                throw "Frame " + (i + 1) + " has a different width";
            }

            if( output.height !== height ) {
                throw "Frame " + (i + 1) + " has a different height";
            }

            if( output.duration < 0 || frame.duration > 0x7fff ) {
                throw "Frame " + (i + 1) + " has a weird duration (must be between 0 and 32767)";
            }

            duration += output.duration;

        }

        var info = {
            duration: duration,
            width: width,
            height: height
        };

        return this.toWebM(webp, info);

    },


    //Polyfill createObjectURL

    createObjectURL: function(blob) {

        var u = window.URL || window.webkitURL || window.mozURL;

        return u.createObjectURL(blob);

    },


    //EBML encoding function

    EBML:  function(width, height, duration) {

        return [

            {
                "id": 0x1a45dfa3, // EBML
                "data": [
                    {
                        "data": 1,
                        "id": 0x4286 // EBMLVersion
                    },
                    {
                        "data": 1,
                        "id": 0x42f7 // EBMLReadVersion
                    },
                    {
                        "data": 4,
                        "id": 0x42f2 // EBMLMaxIDLength
                    },
                    {
                        "data": 8,
                        "id": 0x42f3 // EBMLMaxSizeLength
                    },
                    {
                        "data": "webm",
                        "id": 0x4282 // DocType
                    },
                    {
                        "data": 2,
                        "id": 0x4287 // DocTypeVersion
                    },
                    {
                        "data": 2,
                        "id": 0x4285 // DocTypeReadVersion
                    }
                ]
            },

            {
                "id": 0x18538067, // Segment
                "data": [
                    {
                        "id": 0x1549a966, // Info
                        "data": [
                            {
                                "data": 1e6, //do things in millisecs (num of nanosecs for duration scale)
                                "id": 0x2ad7b1 // TimecodeScale
                            },

                            {
                                "data": "whammy",
                                "id": 0x4d80 // MuxingApp
                            },

                            {
                                "data": "whammy",
                                "id": 0x5741 // WritingApp
                            },

                            {
                                "data": this.doubleToString(duration),
                                "id": 0x4489 // Duration
                            }
                        ]
                    },

                    {
                        "id": 0x1654ae6b, // Tracks
                        "data": [
                            {
                                "id": 0xae, // TrackEntry
                                "data": [
                                    {
                                        "data": 1,
                                        "id": 0xd7 // TrackNumber
                                    },
                                    {
                                        "data": 1,
                                        "id": 0x63c5 // TrackUID
                                    },
                                    {
                                        "data": 0,
                                        "id": 0x9c // FlagLacing
                                    },
                                    {
                                        "data": "und",
                                        "id": 0x22b59c // Language
                                    },
                                    {
                                        "data": "V_VP8",
                                        "id": 0x86 // CodecID
                                    },
                                    {
                                        "data": "VP8",
                                        "id": 0x258688 // CodecName
                                    },
                                    {
                                        "data": 1,
                                        "id": 0x83 // TrackType
                                    },
                                    {
                                        "id": 0xe0,  // Video
                                        "data": [
                                            {
                                                "data": width,
                                                "id": 0xb0 // PixelWidth
                                            },
                                            {
                                                "data": height,
                                                "id": 0xba // PixelHeight
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    },

                    //cluster insertion point
                ]
            }

         ];

    },


    //Make binary data block used in toWebM

    makeSimpleBlock: function(data){

        var flags = 0;
        if (data.keyframe) flags |= 128;
        if (data.invisible) flags |= 8;
        if (data.lacing) flags |= (data.lacing << 1);
        if (data.discardable) flags |= 1;
        if (data.trackNum > 127) {
            throw "TrackNumber > 127 not supported";
        }

        var out = [data.trackNum | 0x80, data.timecode >> 8, data.timecode & 0xff, flags].map(function(e){
            return String.fromCharCode(e)
        }).join('') + data.frame;

        return out;

    },


    // this function was ripped wholesale from weppy

    parseRIFF: function(string){

        var offset = 0;
        var chunks = {};
        var parseRIFF = this.parseRIFF.bind(this);
        var sl = string.length;

        while (offset < sl) {

            var id = string.substr(offset, 4);

            var len = parseInt(string.substr(offset + 4, 4).split('').map(function(i){
                var unpadded = i.charCodeAt(0).toString(2);
                return (new Array(8 - unpadded.length + 1)).join('0') + unpadded
            }).join(''), 2 );

            var data = string.substr(offset + 4 + 4, len);
            offset += 4 + 4 + len;
            chunks[id] = chunks[id] || [];

            if (id == 'RIFF' || id == 'LIST') {

                chunks[id].push(parseRIFF(data));

            } else {

                chunks[id].push(data);

            }
        }

        return chunks;

    },


    //Parse WebP image into object

    parseWebP: function(riff) {

        var VP8 = riff.RIFF[0].WEBP[0];

        var frame_start = VP8.indexOf('\x9d\x01\x2a'); //A VP8 keyframe starts with the 0x9d012a header

        for(var i = 0, c = []; i < 4; i++) {

            c[i] = VP8.charCodeAt(frame_start + 3 + i);

        }

        var width, horizontal_scale, height, vertical_scale, tmp;

        //the code below is literally copied verbatim from the bitstream spec
        tmp = (c[1] << 8) | c[0];
        width = tmp & 0x3FFF;
        horizontal_scale = tmp >> 14;
        tmp = (c[3] << 8) | c[2];
        height = tmp & 0x3FFF;
        vertical_scale = tmp >> 14;

        return {
            width: width,
            height: height,
            data: VP8,
            riff: riff
        };

    },


    //Number to array buffer

    numToBuffer: function(num){

        var parts = [];

        while(num > 0){

            parts.push(num & 0xff)

            num = num >> 8

        }

        return new Uint8Array(parts.reverse());

    },


    //Convert string to array buffer

    strToBuffer: function(str){

        var arr = new Uint8Array(str.length);
        var strlen = str.length;
        for( var i = 0; i < strlen; i++ ){

            arr[i] = str.charCodeAt(i);

        }

        return arr;

    },


    //Bits to array buffer

    bitsToBuffer: function (bits){

        var data = [ ];
        var bitlen = bits.length;

        var pad = (bits.length % 8) ?
            (new Array(1 + 8 - (bitlen % 8))).join('0') : '';

        bits = pad + bits;
        for(var i = 0; i < bitlen; i+= 8){
            data.push(parseInt(bits.substr(i,8),2))
        }

        return new Uint8Array(data);

    },


    //Generate EBML for webM

    generateEBML: function(json){

        var ebml = [ ];
        var jl = json.length;

        var generateEBML = this.generateEBML.bind(this);
        var bitsToBuffer = this.bitsToBuffer;
        var strToBuffer = this.strToBuffer;
        var numToBuffer = this.numToBuffer;

        for( var i = 0; i < jl; i++ ) {

            var data = json[i].data;
            if(typeof data == 'object') data = generateEBML(data);
            if(typeof data == 'number') data = bitsToBuffer(data.toString(2));
            if(typeof data == 'string') data = strToBuffer(data);

            if(data.length) { var z = z; }

            var len = data.size || data.byteLength || data.length;
            var zeroes = Math.ceil(Math.ceil(Math.log(len)/Math.log(2))/8);
            var size_str = len.toString(2);
            var padded = (new Array((zeroes * 7 + 7 + 1) - size_str.length)).join('0') + size_str;
            var size = (new Array(zeroes)).join('0') + '1' + padded;

            ebml.push(numToBuffer(json[i].id));
            ebml.push(bitsToBuffer(size));
            ebml.push(data)

        }

        return new Blob(ebml, {type: "video/webm"});

    },


    //Double Uint8Array from double number

    doubleToString: function(num){
        return [].slice.call(
            new Uint8Array(
                (
                    //create a float64 array
                    new Float64Array([num])
                ).buffer) //extract the array buffer
            , 0) // convert the Uint8Array into a regular array
            .map(function(e){ //since it's a regular array, we can now use map
                return String.fromCharCode(e) // encode all the bytes individually
            })
            .reverse() //correct the byte endianness
            .join('') // join the bytes as a string
    },


    //Convert array to outBuffer flattened array

    toFlatArray: function(arr, outBuffer){

        if(outBuffer == null) { outBuffer = [ ]; }

        var arrlen = arr.length;
        for(var i = 0; i < arrlen; i++) {

            //an array
            if(typeof arr[i] == 'object') {

                this.toFlatArray(arr[i], outBuffer)

            }

            else {
                //a simple element
                outBuffer.push(arr[i]);

            }

        }

        return outBuffer;

    },


    //Change frames to WebMBuffer

    toWebM: function ( frames, info ) {

        var t = this;
        var makeSimpleBlock = t.makeSimpleBlock.bind(t);

        //max duration by cluster in milliseconds

        var CLUSTER_MAX_DURATION = 30000;

        var EBML = t.EBML(info.width, info.height, info.duration);

        //Generate clusters (max duration)
        var frameNumber = 0;
        var frameslength = frames.length;
        var clusterTimecode = 0;
        while(frameNumber < frameslength) {

            var clusterFrames = [];
            var clusterDuration = 0;

            do {
                clusterFrames.push(frames[frameNumber]);
                clusterDuration += frames[frameNumber].duration;
                frameNumber++;
            }

            while(frameNumber < frames.length && clusterDuration < CLUSTER_MAX_DURATION);

            var clusterCounter = 0;
            var cluster = {
                    "id": 0x1f43b675, // Cluster
                    "data": [
                        {
                            "data": clusterTimecode,
                            "id": 0xe7 // Timecode
                        }
                    ].concat(clusterFrames.map(function(webp){
                        var block = makeSimpleBlock({
                            discardable: 0,
                            frame: webp.data.slice(4),
                            invisible: 0,
                            keyframe: 1,
                            lacing: 0,
                            trackNum: 1,
                            timecode: Math.round(clusterCounter)
                        });
                        clusterCounter += webp.duration;

                        return {
                            data: block,
                            id: 0xa3
                        };

                    }))
                }

            //Add cluster to segment
            EBML[1].data.push(cluster);
            clusterTimecode += clusterDuration;

        }

        return this.generateEBML(EBML);

    }

};
