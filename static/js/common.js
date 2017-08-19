//alert('brij!');
//importScript('MediaWiki:Tutorial-QuickRC.js');

/**
 * Common.js: Main script for audio pronunciation evaluation
 *
 * Authors:
 * Brij Mohan Lal Srivastava, 2017, GSoC, CMUSphinx
 */

// Function to load the dependencies, and callback

function getScripts(scripts, callback) {
    var progress = 0;
    scripts.forEach(function(script) { 
        $.getScript(script, function () {
            if (++progress == scripts.length) callback();
        }); 
    });
}

dependencies = ['/static/js/recorder.js',
                '/static/js/callbackmanager.js',
                '/static/js/volumemeter.js',
                '/static/js/constants.js']

getScripts(dependencies, function() { 
    
    var meter = null;
    var canvasContext = null;
    var WIDTH=50;
    var HEIGHT=50;
    var rafID = null;
    
    var eval_results = null;
    var grammarIds = [];
    
    // These will be initialized later
    var recognizer, recorder, callbackManager, audio_context, outputContainer;
    // Only when both recorder and recognizer do we have a ready application
    var isRecorderReady = true, isRecognizerReady = false;
    var i16_buf;

    var outputSampleRate = 16000;
    var inSampleRate;
    
    // TO render the gadget body
    $(document).ready( function() {
      
      /*
      $('.audiotable tbody tr').append('<td>Try saying: \
            <button type="button" class="btn btn-default btn-rec">Record <i class="material-icons">fiber_manual_record</i></button> \
            <canvas class="meter" height="35px" width="25px"></canvas> \
            <button type="button" data-word="because" class="btn btn-default btn-stop">Stop <i class="material-icons">stop</i></button> \
            <span class="recaudio"></span> \
            <button type="button" class="btn btn-default btn-eq">Evaluate <i class="material-icons">equalizer</i></button> \
            <button type="button" class="btn btn-default btn-say">Say in phrase <i class="material-icons">insert_link</i></button> \
          </td>');
          */
          
      // Attach events
      $('.audiotable').on('click', 'button.btn-rec', function(evt) {
        //alert('Started recording...');
        startRecording();
                // grab our canvas
                console.log(evt.target);
          canvasContext = $(evt.target).parents('td').find('.meter')[0].getContext("2d");
          drawLoop();
      });
      $('.audiotable').on('click', 'button.btn-stop', function(evt) {
        //alert('Stopped recording...');
        stopRecording(evt);
                // nullify the canvas
          canvasContext = null;
      });
      /*$('.audiotable').on('click', 'button.btn-play', function(evt) {
        alert('Started playing...');
      });*/
      $('.audiotable').on('click', 'button.btn-say', function(evt) {
        alert('Start saying...');
      });
    
      $('.audiotable').on('click', 'button.btn-eq', function(evt) {
        renderQuickRCDialog();
      });
    });
    
    $(document).ready( function() {
      callbackManager = new CallbackManager();
      spawnWorker("/static/js/recognizer.js", function(worker) {
              // This is the onmessage function, once the worker is fully loaded
              worker.onmessage = function(e) {

                  // This is the case when we got new feats from featex library
                  if (e.data.hasOwnProperty('feats')) {
                    console.log("feats", e.data);
                  }
                  
                  // This is the case when we have a callback id to be called
                  if (e.data.hasOwnProperty('id')) {
                    var clb = callbackManager.get(e.data['id']);
                    var data = {};
                    if ( e.data.hasOwnProperty('data')) data = e.data.data;
                    if(clb) clb(data);
                  }
                  
                  // This is a case when the recognizer has a new hypothesis
                  if (e.data.hasOwnProperty('hypseg')) {
                    //var newHyp = e.data.hyp;
                    if (e.data.hasOwnProperty('final') &&  e.data.final) {
                      //newHyp = "Final: " + newHyp;
                      //compute_score(newHyp, e.data.hypseg);
                      if (e.data.hasOwnProperty('data')) {
                        if (e.data.data.stage == 0) {
                          // Send segmentation output to tri-phone processing
                          process_stage_1(e.data.hypseg);
                        }
                      }
                      
                    } else {
                      console.log(e.data);
                    }
                    console.log(e.data);
                  }

                  // This is the case when we have an error
                  if (e.data.hasOwnProperty('status') && (e.data.status == "error")) {
                  }
              };
              // Once the worker is fully loaded, we can call the initialize function
              initRecognizer();
          });

        try {
          // webkit shim
          window.AudioContext = window.AudioContext || window.webkitAudioContext;
          navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia;
          window.URL = window.URL || window.webkitURL;
          
          audio_context = new AudioContext();
          console.log('Audio context set up.');
          console.log('navigator.getUserMedia ' + (navigator.getUserMedia ? 'available.' : 'not present!'));

          inSampleRate = audio_context.sampleRate;

        } catch (e) {
          alert('No web audio support in this browser!');
        }
        
        navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
          console.log('No live audio input: ' + e);
        });
      });
      
      function decode_buffer_align(decode_word, f32_arr) {
        //var i16_buf = new Int16Array(f32_arr.buffer);
        i16_buf = format_audio(f32_arr);
        console.log(f32_arr);
        console.log(i16_buf.length, i16_buf);

        //postRecognizerJob({command: 'testprint'});
        
        
        postRecognizerJob({command: 'lookupWord', data: decode_word},
              function(cbdata) {
                console.log(cbdata);
                postRecognizerJob({command: 'featex', data: {array: i16_buf, word: decode_word}});
                //postRecognizerJob({command: 'stopwordalign', data: {'stage': 0}});
              });
              
              
        
        //postRecognizerJob({command: 'wordalign', data: {array: i16_buf, word: decode_word}});
      //postRecognizerJob({command: 'stopwordalign', data: {'stage': 0}});
        
        //var align_gram = generateAlignGrammar(decode_word);
        //console.log(align_gram);
        
        /*
        postRecognizerJob({command: 'addGrammar', data: align_gram},
                function(id) {
                  //console.log(id, i16_buf);
                  postRecognizerJob({command: 'start', data: id});
                  postRecognizerJob({command: 'process', data: i16_buf});
                  postRecognizerJob({command: 'stop', data: {'stage': 0}});
                  //postRecognizerJob({command: 'stopwordalign', data: {'stage': 0}});
                });
                */
            
    }
    
    function process_stage_1(hyp_seg) {
      console.log(hyp_seg);
      var framesc = 160;
      for (var n = 1; n < hyp_seg.length - 1; n++) {
        
        // Extract tri-phone sub segment
        var left = hyp_seg[n-1].word;
        var leftn = hyp_seg[n-1].start;
        var target = hyp_seg[n].word;
        var right = hyp_seg[n+1].word;
        var rightn = hyp_seg[n+1].end;
        
        var sil = Array.apply(null, Array(16000)).map(Number.prototype.valueOf,0);
        var subseg = sil.concat(i16_buf.slice(leftn*framesc, rightn*framesc)).concat(sil);
        var ap_gram = generateAllPhonemesGrammar(left, right);
        // Decode using all phonemes1 grammar
      }
    }
      
      function compute_score(newHyp, hypseg) {
        // Calculate mean
            var mean = 0.0;
            //var hypseg = e.data.hypseg;
            var cnt = 0;
            for (var i = 0; i < hypseg.length; i++) {
              if (PROREMEDY.VALID_WORDS.indexOf(hypseg[i].word) != -1) {
                cnt++;
                mean += hypseg[i].ascr;
              }
            }
            mean /= cnt;

            // Calculate std deviation
            cnt = 0;
            var std = 0;
            for (i = 0; i < hypseg.length; i++) {
              if (PROREMEDY.VALID_WORDS.indexOf(hypseg[i].word) != -1) {
                cnt++;
                var diff = (hypseg[i].ascr - mean);
                std += (diff * diff);
              }
            }
            std /= cnt;

            std = Math.sqrt(std);

            console.log("Mean = " + mean);
            console.log("Std = " + std);

            var mean_var_str = "<p> Mean : " + mean.toFixed(2) + "<br> Std. deviation : " + std.toFixed(2) + "</p>"

            //var table_str = "<table border='1'><tr><td>Word</td><td>Normalized score</td><td>Duration</td></tr>";
            var table_str = "<table class='table table-bordered'>";
            var tr1 = "<tr><th>Word</th>";
            var tr2 = "<tr><th>Normalized score</th>";
            var tr3 = "<tr><th>Duration</th>";
            for (i = 0; i < hypseg.length; i++) {
              if (PROREMEDY.VALID_WORDS.indexOf(hypseg[i].word) != -1) {
                var score = (hypseg[i].ascr - mean) / std;
                //table_str += "<tr><td>" + hypseg[i].word + "</td><td>" + score + "</td><td>" + ((hypseg[i].end - hypseg[i].start)/100.0) + "</td></tr>";
                tr1 += "<td>" + hypseg[i].word + "</td>";
                tr2 += "<td>" + score.toFixed(2) + "</td>";
                tr3 += "<td>" + ((hypseg[i].end - hypseg[i].start)/100.0) + "</td>";
                console.log("Word = " + hypseg[i].word + " : Score = " + score + " : Duration = " + (hypseg[i].end - hypseg[i].start)/100.0);
              }
            }
            table_str += (tr1 + "</tr>");
            table_str += (tr2 + "</tr>");
            table_str += (tr3 + "</tr>");
            table_str += "</table>";

            content_str = newHyp + "<br><br>" + mean_var_str + table_str + "<br>" + "<img class='fbimg' src='https://raw.githubusercontent.com/brijmohan/iremedy/gh-pages/feedback.png'>";
      eval_results = content_str;
      
            renderQuickRCDialog(content_str);
      }
  
    // Volume meter code for connecting audio stream to visual update
    function gotStream(stream) {
        // Create an AudioNode from the stream.
        mediaStreamSource = audio_context.createMediaStreamSource(stream);
    
        // Create a new volume meter and connect it.
        meter = createAudioMeter(audio_context);
        mediaStreamSource.connect(meter);
    
        // kick off the visual updating
        drawLoop();
    }
  
    function drawLoop( time ) {
          if (canvasContext) {
          // clear the background
          canvasContext.clearRect(0,0,WIDTH,HEIGHT);
      
          // check if we're currently clipping
          if (meter.checkClipping())
              canvasContext.fillStyle = "red";
          else
              canvasContext.fillStyle = "green";
      
          // draw a bar based on the current volume
            canvasContext.fillRect(0, HEIGHT - meter.volume*HEIGHT*5, WIDTH, meter.volume*HEIGHT*5);
      
          // set up the next visual callback
          rafID = window.requestAnimationFrame( drawLoop );
          }
    }
  
      function renderQuickRCDialog( content ) {
        if (!content) content = eval_results;
      var $dialog = $( '<div></div>' )
        .html(
          '<strong>' +
          mw.message('quickchanges-greeting', mw.user.getName()).escaped() +
          '</strong> ' +
          '<br/>' + content
        )
        .dialog({
          autoOpen: true,
          title: mw.message('quickchanges-title').plain(),
          width: '70%',
          modal: true
        });
    }
    
      // This starts recording. We first need to get the id of the grammar to use
      var startRecording = function() {
        if (recorder) recorder.record();
      };
  
    // Stops recording
    var stopRecording = function(evt) {
      recorder && recorder.stop();
        createDownloadLink(evt);
        var decode_word = $(evt.target).parents('td').find('.btn-stop').data('word');
        console.log("Decode==>", decode_word);
        recorder.getBuffer(function(buf){
          //console.log(buf);
          decode_buffer_align(decode_word, buf[0]);
        });
        recorder.clear();
    };
    
    function format_audio(inputArray){
      // COnvert the float samples to 16-bit integers
        var output = new Int16Array(inputArray.length);
        for (var i = 0; i < inputArray.length; i++){
            var s = Math.max(-1, Math.min(1, inputArray[i]));
            //output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            output[i] = s * 0xFFFF;
        }
        
        // Downsample audio to 16k
        console.log(inSampleRate, outputSampleRate);
        var outputBufferLength = Math.floor(output.length * outputSampleRate / inSampleRate);
        var result = new Int16Array(outputBufferLength);
        var bin = 0,
        num = 0,
        indexIn = 0,
        indexOut = 0;
      while(indexIn < outputBufferLength) {
          bin = 0;
          num = 0;
          while(indexOut < Math.min(output.length, (indexIn + 1) * inSampleRate / outputSampleRate)) {
          bin += output[indexOut];
          num += 1;
          indexOut++;
          }
          result[indexIn] = bin / num;
          indexIn++;
      }
        
        return result;
    }
    
    function createDownloadLink(evt) {
        recorder && recorder.exportWAV(function(blob) {
          var url = URL.createObjectURL(blob);
          var au = document.createElement('audio');
          
          au.controls = true;
          au.src = url;
          $(evt.target).parents('td').find('span.recaudio').html(au);
        });
    }
  
      function startUserMedia(stream) {
      //var input = audio_context.createMediaStreamSource(stream);
        console.log('Media stream created.');
      var input = audio_context.createMediaStreamSource(stream);
        // Firefox hack https://support.mozilla.org/en-US/questions/984179
        window.firefox_audio_hack = input; 
        var audioRecorderConfig = {
          errorCallback: function(x) {
            updateStatus("Error from recorder: " + x);
            
          },
          sampleRate: 16000,
          numChannels: 1
        };
        recorder = new Recorder(input, audioRecorderConfig);
        // If a recognizer is ready, we pass it to the recorder
        //if (recognizer) recorder.consumers = [recognizer];
        isRecorderReady = true;
        updateStatus("Audio recorder ready");
        //recorder = new Recorder(input);
        console.log('Recorder initialised.');
        gotStream(stream);
      }

    // A convenience function to post a message to the recognizer and associate
    // a callback to its response
    function postRecognizerJob(message, callback) {
        var msg = message || {};
        if (callbackManager) msg.callbackId = callbackManager.add(callback);
        if (recognizer) recognizer.postMessage(msg);
    }
  
    // This is just a logging window where we display the status
    function updateStatus(newStatus) {
        console.log(newStatus);
    }
  
    // This function initializes an instance of the recorder
    // it posts a message right away and calls onReady when it
    // is ready so that onmessage can be properly set
    function spawnWorker(workerURL, onReady) {
      recognizer = new Worker(workerURL);
      recognizer.onmessage = function(event) {
        onReady(recognizer);
      };
      recognizer.postMessage('');
    }
    
    function generateAlignGrammar(word) {
      var pron = PROREMEDY.CMUDICT[word].toLowerCase().split(" ");
      var ti;
      var alignGram = {
        "numStates": pron.length + 3,
        "start": 0,
        "end": pron.length + 2,
        "transitions": []
      };
      alignGram["transitions"].push({from: 0, to: 1, word: "sil"});
      for (ti = 1; ti < pron.length+1; ti++) {
        alignGram["transitions"].push({from: ti, to: ti+1, word: pron[ti-1]});
      }
      alignGram["transitions"].push({from: pron.length+1, to: pron.length+2, word: "sil"});
      alignGram["transitions"].push({from: pron.length+1, to: pron.length+2, word: ""});
      return alignGram;
    }
    
    function generateAllPhonemesGrammar(left_word, right_word) {
      var numstates = 6;
      var endState = 5;
      if (left_word == "sil") {
        numstates--;
        endState--;
      }
      if (right_word == "sil") {
        numstates--;
        endState--;
      }
      var allphoneGram = {
        "numStates": numstates,
        "start": 0,
        "end": endState,
        "transitions": []
      };
      allphoneGram["transitions"].push({from: 0, to: 1, word: "sil"});
      var statenum = 1;
      if (left_word != "sil") {
        allphoneGram["transitions"].push({from: 1, to: 2, word: left_word});
        statenum++;
      }
      var ti;
      for (ti = 0; ti < PROREMEDY.ALLPHONEMES1.length; ti++) {
        allphoneGram["transitions"].push({from: statenum, to: statenum+1, word: PROREMEDY.ALLPHONEMES1[ti]});
      }
      statenum++;
      if (right_word != "sil") {
        allphoneGram["transitions"].push({from: statenum, to: statenum+1, word: right_word});
        statenum++;
      }
      allphoneGram["transitions"].push({from: statenum, to: statenum+1, word: "sil"});
      allphoneGram["transitions"].push({from: statenum, to: statenum+1, word: ""});
      
      return allphoneGram;
    }
        
    // This adds a grammar from the grammars array
    // We add them one by one and call it again as
    // a callback.
    // Once we are done adding all grammars, we can call
    // recognizerReady()
    /*var feedGrammar = function(g, index, id) {
        if (id && (grammarIds.length > 0)) grammarIds[0].id = id.id;
        if (index < g.length) {
            grammarIds.unshift({title: g[index].title})
          postRecognizerJob({command: 'addGrammar', data: g[index].g},
                    function(id) {feedGrammar(PROREMEDY.GRAMMARS, index + 1, {id:id});});
        } else {
          recognizerReady();
        }
    }*/
  
    // This adds words to the recognizer. When it calls back, we add grammars
    var feedWords = function(words) {
        postRecognizerJob({command: 'addWords', data: words},
            function() {
              //feedGrammar(PROREMEDY.GRAMMARS, 0);
              // TODO: INDICATE THAT RECOGNIZER IS USABLE NOW
              console.log("Decoder must be ready now!!!");
            });
    };
  
    // This initializes the recognizer. When it calls back, we add words
    var initRecognizer = function() {
        // You can pass parameters to the recognizer, such as : {command: 'initialize', data: [["-hmm", "my_model"], ["-fwdflat", "no"]]}
        var ps_config = [
            ["-topn", "64"],
            ["-beam", "1e-57"],
            ["-wbeam", "1e-56"],
            ["-maxhmmpf", "-1"],
            ["-samprate", "16000"],
            ["-frate", "65"],
            ["-fsgusefiller", "no"]
          ];
        postRecognizerJob({command: 'initialize', data: ps_config},
                            function() {
                                //if (recorder) recorder.consumers = [recognizer];
                                feedWords(PROREMEDY.WORDLIST);
                         });
    };

});
