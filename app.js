var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var HashMap = require('hashmap');
var emoji = require('node-emoji');
var cfenv = require('cfenv');
var app = express();
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

var map = new HashMap();
var score_map = new HashMap();
var game_map = new HashMap();
var chat_map = new HashMap();

var feeling_map = new HashMap();

var appEnv = cfenv.getAppEnv();
var weather_host = "WEATHER_HOST";

function weatherAPI(path, qs, done) {
    var url = weather_host + path;

    request({
        url: url,
        method: "GET",
        headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "application/json"
        },
        qs: qs
    }, function(err, req, data) {
        if (err) {
            console.log(err);
            done(err);
        } else {
            if (req.statusCode >= 200 && req.statusCode < 400) {
                try {
                    done(null, JSON.parse(data));
                } catch(e) {
                    console.log(e);
                    done(e);
                }
            } else {
                console.log(err);
                done({ message: req.statusCode, data: data });
            }
        }
    });
}

// This code is called only when subscribing the webhook //
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'TOKEN') {
        res.send(req.query['hub.challenge']);
    }
    res.send('Error, wrong validation token');
});

app.use(express.static(__dirname + '/public'));
app.get('/tos', function (req, res) {
    res.redirect('tos.html');
});

// Incoming messages reach this end point //
app.post('/webhook/', function (req, res) {

    var data = req.body;
    messaging_events = req.body.entry[0].messaging;

    for (i = 0; i < messaging_events.length; i++) {
        event = req.body.entry[0].messaging[i];

        //console.log("e="+JSON.stringify(event));
        
        var sender = event.sender.id;
        if ((event.message && event.message.text) || (event.postback && event.postback.payload)) {
            if (event.postback) {
                text = event.postback.payload;
            } else {
                text = event.message.text;
            }
            
            //text = text.replace("IBM&FinTechFestival", "IBM and FinTechFestival");
            text = text.replace("&", " and ");

            var check_trivia = text.toLowerCase();
            //console.log("ct="+check_trivia);
            var trivia = check_trivia.indexOf("trivia");
            var trivia_timeout = false;
            //var trivia_timeout_check;
            //console.log("tr="+trivia);
            
            if (!chat_map.has(sender)) {
                chat_map.set(sender,0);
                request("http://sgfintechchat.mybluemix.net/stats?sender="+sender+"&type=unique_user&created="+new Date(), function (error, response,body) {
                    console.log('unique user identified');
                });
            }

            if (trivia >= 0 && !map.has(sender)) {
                map.set(sender,new Date());
                score_map.set(sender,0);
                game_map.set(sender,0);
                
            } else {
                if(map.has(sender)) {
                    var last_access = map.get(sender);
                    //console.log("last_access="+last_access);
                    var now = new Date();
                    //console.log('diff='+(now-last_access));
                    var diff = now - last_access;
                    if (diff >= 900000) {
                        
                        request("http://sgfintechchat.mybluemix.net/stats?sender="+sender+"&type=new_thread&created="+new Date(), function (error, response,body) {
                            console.log('new chat thread');
                        });

                    } else if (diff >= 60000) {
                        map.remove(sender);
                        score_map.remove(sender);
                        trivia_timeout = true;
                    } else {
                        map.set(sender,new Date());

                    }
                }
            }
    
            if (trivia < 0 && !map.has(sender) && !trivia_timeout) {

                request("http://sgfintechchat.mybluemix.net/chat?sender="+sender+"&text=" + text, function (error, response,body) {
                    var body_json = JSON.parse(body);
                    //console.log("body_json=",JSON.stringify(body_json));
                    //console.log("action=",JSON.stringify(body_json.output.action));
                    //console.log("node=",JSON.stringify(body_json.output.node));

                    var comb_text = "";
                    for(var i = 0; i < body_json.output.text.length; i++) {
                        comb_text += body_json.output.text[i] + " ";
                    }

                    if(body_json.output.node === "laugh") {
                        comb_text = comb_text.replace('^smile^',emoji.get('smile'));
                    }
                    if(body_json.output.node === "help") {
                        comb_text = comb_text.replace('^blush^',emoji.get('blush'));
                    }
                    if(body_json.output.node === "hi") {
                        comb_text = comb_text.replace('^grinning^',emoji.get('grinning'));
                    }

                    if(body_json.output.action === "replace") {
                        request({
                            url: 'https://graph.facebook.com/v2.6/' + sender,
                            qs: {access_token: token},
                            method: 'GET'
                            }, function (error, resp, fbbody) {
                            if (error) {
                                console.log('Error sending message: ', error);
                            } else if (resp.body.error) {
                                console.log('Error: ', resp.body.error);
                            } else {
                                var fbbody_json = JSON.parse(fbbody);
                                //console.log('fbbody='+JSON.stringify(fbbody_json));
                                //var output_text = body_json.output.text[0];
                                comb_text = comb_text.replace('^name^',fbbody_json.first_name);
                                //output_text = output_text.replace('^grinning^',emoji.get('grinning'));
                                sendQuickReplies(sender, body_json.output.node, comb_text);
                                //sendImage(sender, output_text);
                            }
                        });
                    } else if (body_json.output.action === "selection") {

                        console.log("node="+body_json.output.node);

                        if (body_json.output.node === "main-weather") {

                            weatherAPI("/api/weather/v1/geocode/1.2797339/103.7835744/observations.json?language=en-US&units=m",null, function(err, result) {
                                console.log('result');
                                if (err) {
                                    //res.send(err).status(400);
                                    console.log(err);
                                } else {
                                    var weather_data = result.observation;
                                    //console.log("weather_data="+JSON.stringify(weather_data));
                                    comb_text = comb_text + "it is " + weather_data.temp + " and " + weather_data.wx_phrase.toLowerCase() + ". ";
                                    
                                    if(weather_data.wx_phrase.toLowerCase().indexOf('rain') >= 0 || weather_data.wx_phrase.toLowerCase().indexOf('shower') >= 0 || weather_data.wx_phrase.toLowerCase().indexOf('storm') >= 0) {
                                        comb_text = comb_text + "Stay dry and looks like you will need an umbrella";
                                    } else if (weather_data.temp >= 30 ) {
                                        comb_text = comb_text + "Drink more water and keep hydrated"
                                    } else {
                                        comb_text = comb_text + "Stay cool!"
                                    }
                                    sendQuickReplies(sender,body_json.output.node,comb_text);
                                }
                            });

                        } else {
                            //console.log('else');
                            sendQuickReplies(sender, body_json.output.node, comb_text);
                        }
                        
                    } else if (body_json.output.action === "redirect") {
                        map.set(sender,new Date());
                        score_map.set(sender,0);
                        request("http://sgfintechchat.mybluemix.net/trivia?sender="+sender+"&text=" + body_json.output.text, function (error, response,body) {
                            var body_json = JSON.parse(body);

                            //console.log('trivia=body_json.output.action='+body_json.output.action);
                            var comb_text = "";
                            for(var i = 0; i < body_json.output.text.length; i++) {
                                comb_text += body_json.output.text[i] + " ";   
                            }
                            if (body_json.output.node === "trivia-start") {
                                //sendMessage(sender,comb_text);
                                sendQuickReplies(sender, body_json.output.node,comb_text); 
                            } else if (body_json.output.node === "exit") {
                                console.log('redirect_exit');
                                map.remove(sender);
                                score_map.remove(sender);
                                console.log("1 map id="+sender+" moved");
                                sendQuickReplies(sender, body_json.output.node,comb_text); 
                            } else {
                                sendMessage(sender,comb_text);
                                sendSelection(sender, body_json.output.node,comb_text); 
                            }
                            
                        });
                    } else if (body_json.output.action === "website") {
                        var comb_text = "";
                        for(var i = 0; i < body_json.output.text.length; i++) {
                            comb_text += body_json.output.text[i] + " ";
                        }
                        //sendMessage(sender, comb_text)
                        sendWebsite(sender, body_json.output.node, comb_text);
                        sendQuickReplies(sender, body_json.output.node, comb_text)

                    } else {
                        sendQuickReplies(sender, body_json.output.node, comb_text)
                    }
                    
                }); 
            } else {
                request("http://sgfintechchat.mybluemix.net/trivia?sender="+sender+"&text=" + text, function (error, response,body) {
                    var body_json = JSON.parse(body);

                    if (trivia_timeout) {
                        map.remove(sender);
                        score_map.remove(sender);
                        sendQuickReplies(sender,"trivia-timeout","My apologies.. I thought you're bored with the game.."); 
                    } else {

                        var comb_text = "";
                        for(var i = 0; i < body_json.output.text.length; i++) {
                              comb_text += body_json.output.text[i] + " ";
                        }

                        //console.log('trivia-body_json.output.action='+body_json.output.action);

                        if(body_json.output.score) {
                            var sc_map = score_map.get(sender);
                            var new_score = sc_map + body_json.output.score;
                            score_map.set(sender,new_score);
                        }

                        if(body_json.output.action === "replace") {

                        } else if (body_json.output.action === "selection") {
                            
                            if(body_json.output.node === "exit" || body_json.output.node === "bluemix1" || body_json.output.node === "bluemix2" ) {
                                
                                if (body_json.output.node === "exit") {
                                    map.remove(sender);
                                    score_map.remove(sender);
                                    sendQuickReplies(sender,body_json.output.node,comb_text); 
                                } else {
                                    sendQuickReplies(sender,body_json.output.node,comb_text);     
                                }
                            } else if (body_json.output.node === "blockchain") {
                                sendMessage(sender,comb_text);
                                sendSelection(sender, body_json.output.node,comb_text);
                            } else {
                                sendQuickReplies(sender, body_json.output.node,comb_text);
                            }
                        } else if (body_json.output.action === "website") {
                            sendMessage(sender, comb_text);
                            sendWebsite(sender, body_json.output.node, "");
                        } else if (body_json.output.action === "main") {
                            if(body_json.output.node === "winprize") {
                                if(score_map.get(sender) == 11) {
                                    request("http://sgfintechchat.mybluemix.net/stats?sender="+sender+"&type=trivia_maxscore&created="+new Date(), function (error, response,body) {
                                        console.log('consecutive score');
                                    });
                                }
                                comb_text = comb_text.replace('^hand^',emoji.get('clap'));
                            }
                            map.remove(sender);
                            score_map.remove(sender);
                            sendQuickReplies(sender, body_json.output.node,comb_text);
                        } else {
                            sendMessage(sender,comb_text);
                        }
                    }
                });
            }

        }
    }
    res.sendStatus(200);
});

function sendQuickReplies(sender,node,text) {

    console.log("node="+node);
    
    var messageData = {};

    //console.log('node='+node);
    if (node === "display") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Watson",
                payload:"Watson"
            },
            {
                content_type: "text",
                title: "Bluemix",
                payload:"Bluemix"
            },
            {
                content_type: "text",
                title: "Blockchain",
                payload:"Blockchain"
            },
            {
                content_type: "text",
                title: "Interactive Design",
                payload:"Interactive Design"
            },
            {
                content_type: "text",
                title: "Analytics",
                payload:"Analytics"
            }
            ]
        }
    } else if (node === "trivia-start") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Yes",
                payload:"Yes"
            },
            {
                content_type: "text",
                title: "No",
                payload:"No"
            },
            {
                content_type: "text",
                title: "Bye",
                payload:"Bye"
            }
            ]
        }
    } else if (node === "trivia-watson") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Tone Analyzer",
                payload:"Tone Analyzer"
            },
            {
                content_type: "text",
                title: "Blockchain",
                payload:"Blockchain"
            },
            {
                content_type: "text",
                title: "Conversation",
                payload:"Conversation"
            },
            {
                content_type: "text",
                title: "Chatbot",
                payload:"Chatbot"
            },
            {
                content_type: "text",
                title: "SoftLayer",
                payload:"SoftLayer"
            },
            {
                content_type: "text",
                title: "Personality Insights",
                payload:"Personality Insights"
            }
            ]
        }
    } else if (node === "trivia-garage") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Agile",
                payload:"Agile"
            },
            {
                content_type: "text",
                title: "Waterfall",
                payload:"Waterfall"
            },
            {
                content_type: "text",
                title: "Design Thinking",
                payload:"Design Thinking"
            }
            ]
        }
    } else if (node === "trivia-timeout") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "IBM Lab Crawl Trivia",
                payload:"IBM Lab Crawl Trivia"
            },
            {
                content_type: "text",
                title: "Interesting Topics",
                payload:"Interesting Topics"
            },
            {
                content_type: "text",
                title: "I need help",
                payload:"I need help"
            },
            {
                content_type: "text",
                title: "How are you?",
                payload:"How are you?"
            },
            {
                content_type: "text",
                title: "How is weather?",
                payload:"How is weather?"
            },
            ]
        }
    } else if (node === "festival-main") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "FinTech",
                payload:"FinTech"
            },
            {
                content_type: "text",
                title: "IBM & FinTech",
                payload:"IBM & FinTech"
            },
            {
                content_type: "text",
                title: "IBM&FinTechFestival",
                payload:"IBM and FinTech Festival"
            },
            {
                content_type: "text",
                title: "More information",
                payload:"More information"
            }
            ]
        }
    } else if (node === "exit") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Hi",
                payload:"hi"
            },
            {
                content_type: "text",
                title: "Interesting Topics",
                payload:"Interesting Topics"
            },
            {
                content_type: "text",
                title: "IBM Lab Crawl Trivia",
                payload:"IBM Lab Crawl Trivia"
            },
            {
                content_type: "text",
                title: "I need help",
                payload:"I need help"
            },
            {
                content_type: "text",
                title: "How are you?",
                payload:"How are you?"
            }
            ]
        }
    } else if (node === "bluemix1") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "IBM Bluemix",
                payload:"IBM Bluemix"
            },
            {
                content_type: "text",
                title: "IBM Power Systems",
                payload:"IBM Power Systems"
            },
            {
                content_type: "text",
                title: "IBM WebSphere",
                payload:"IBM WebSphere"
            }
            ]
        }
    } else if (node === "bluemix2") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Less than 50",
                payload:"Less than 50"
            },
            {
                content_type: "text",
                title: "Between 50 to 100",
                payload:"Between 50 to 100"
            },
            {
                content_type: "text",
                title: "More than 150",
                payload:"More than 150"
            }
            ]
        }
    } else if (node === "hi" || node === "main-care") {
        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Feeling Great!",
                payload:"Feeling Great!"
            },
            {
                content_type: "text",
                title: "Can be better",
                payload:"Can be better"
            }
            ]
        }
    } else if (node === "main-name") {
        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Bluemix",
                payload:"Bluemix"
            },
            {
                content_type: "text",
                title: "Watson",
                payload:"Watson"
            }
            ]
        }
    } else if (node === "sorry") {
        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "How are you?",
                payload:"How are you?"
            },
            {
                content_type: "text",
                title: "Interesting Topics",
                payload:"Interesting Topics"
            },
            {
                content_type: "text",
                title: "FinTech",
                payload:"FinTech"
            },
            {
                content_type: "text",
                title: "SG FinTech Festival",
                payload:"SG FinTech Festival"
            },
            {
                content_type: "text",
                title: "How is weather?",
                payload:"Howi s weather?"
            },
            {
                content_type: "text",
                title: "I need help",
                payload:"I need help"
            }
            ]
        }

    } else if (node === "blockchain" || node === "bluemix" || node === "watson" || node === "garage" || node === "analytic") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Speak to our expert",
                payload:"Speak to our expert"
            },
            {
                content_type: "text",
                title: "More information",
                payload:"More information"
            },
            {
                content_type: "text",
                title: "Interesting Topics",
                payload:"Interesting Topics"
            }
            ]
        }

    } else {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "How are you?",
                payload:"How are you?"
            },
            {
                content_type: "text",
                title: "Talk to our expert",
                payload:"Talk to our expert"
            },
            {
                content_type: "text",
                title: "Interesting Topics",
                payload:"Interesting Topics"
            },
            {
                content_type: "text",
                title: "How is weather?",
                payload:"How is weather?"
            },
            {
                content_type: "text",
                title: "I need help",
                payload:"I need help"
            }
            ]
        }
    } 

    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });

}

function sendSelection(sender,node,text) {
    
    var messageData = {};

    //console.log('node='+node);
    if (node === "display") {

        messageData = {
            text: text,
            quick_replies: [
            {
                content_type: "text",
                title: "Watson",
                payload:"Watson"
            },
            {
                content_type: "text",
                title: "Bluemix",
                payload:"Bluemix"
            },
            {
                content_type: "text",
                title: "Blockchain",
                payload:"Blockchain"
            },
            {
                content_type: "text",
                title: "Interactive Design",
                payload:"Interactive Design"
            },
            {
                content_type: "text",
                title: "Analytics",
                payload:"Analytics"
            }
            ]
        }

    } else if (node === "blockchain") {
        //console.log('node2='+node);
        
        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "Blockchain is a cryptocurrency, similar to Bitcoin.",
                        //subtitle: "Blockchain is a cryptocurrency, similar to Bitcoin.",
                        buttons: [
                            {
                                "type": "postback",
                                "title": "Choose",
                                "payload": "blockchain-2"
                            }              
                        ]
                    }, {
                        title: "Blockchain is a shared, immutable ledger for recording the history of transactions.",
                        //subtitle: "Blockchain is a shared, immutable ledger for recording the history of transactions.",
                        buttons: [
                            {
                                "type": "postback",
                                "title": "Choose",
                                "payload": "blockchain-1"
                            }              
                        ]
                    }, {
                        title: "Blockchain is a centralized secured database.",
                        //subtitle: "Blockchain is a shared, immutable ledger for recording the history of transactions.",
                        buttons: [
                            {
                                "type": "postback",
                                "title": "Choose",
                                "payload": "blockchain-3"
                            }              
                        ]
                    }

                    ]
                }
            }
        }

    }

    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });

}

function sendLocation(sender,text) {
    

    messageData = {
        "text":"Feel free to share your location.",
        "quick_replies":[
          {
            "content_type":"location",
          }
        ]
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });

}

function sendWebsite(sender,node,text) {

    if (node === "expert") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "Registration",
                        item_url: "https://www-01.ibm.com/events/wwe/grp/grp307.nsf/Registration.xsp?openform&seminar=Q7A5UVES&locale=en_ZZ",
                        image_url: "https://scontent.xx.fbcdn.net/t31.0-8/14939593_10153817756790870_3722487707296601667_o.jpg",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "https://www-01.ibm.com/events/wwe/grp/grp307.nsf/Registration.xsp?openform&seminar=Q7A5UVES&locale=en_ZZ",
                            title: "Register"
                            }             
                        ]
                    } ]
                }
            }   
        }
    } else if (node === "blockchain") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Blockchain",
                        item_url: "http://www.ibm.com/blockchain/",
                        image_url: "https://www-01.ibm.com/events/wwe/grp/grp021.nsf/LookupElementsImage/Blockchain%20Event%20Belgium/$FILE/GRP_blockchain_556x200.jpg",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://www.ibm.com/blockchain/",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "bluemix") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Bluemix",
                        item_url: "http://bluemix.net/",
                        image_url: "https://www.ibm.com/blogs/nordic-msp/wp-content/uploads/2016/09/Bluemix.png",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://bluemix.net/",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "watson") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Watson",
                        item_url: "http://www.ibm.com/watson/",
                        image_url: "http://www-03.ibm.com/press/us/en/attachment/36825.wss?fileId=ATTACH_FILE0&fileName=infogr5.jpg",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://www.ibm.com/watson/",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }
    } else if (node === "garage") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Design Thinking",
                        image_url: "http://www.designorate.com/wp-content/uploads/2016/02/ibm-design-thinking-model-1.jpg",
                        item_url: "https://www.ibm.com/design/thinking/",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "https://www.ibm.com/design/thinking/",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "analytic") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Analytics",
                        image_url: "http://www-01.ibm.com/software/analytics/media/email/IBM_Analytics_SPSS_Banner.png",
                        item_url: "http://www.ibmbigdatahub.com/tag/2679",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://www.ibmbigdatahub.com/tag/2679",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "watson-dontknow") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM Watson",
                        item_url: "https://console.ng.bluemix.net/catalog/?category=watson",
                        //image_url: "https://www.ibm.com/blogs/nordic-msp/wp-content/uploads/2016/09/Bluemix.png",
                        subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "https://console.ng.bluemix.net/catalog/?category=watson",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "fintech") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "Financial Technology",
                        item_url: "https://en.wikipedia.org/wiki/Financial_technology",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "https://en.wikipedia.org/wiki/Financial_technology",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "festival") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "SG FinTech Festival",
                        image_url: "http://fintechnews.sg/wp-content/uploads/2016/06/Singapore-Fintech-Festival-2016-817x404_c.png",
                        item_url: "http://www.fintechfestival.sg/",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://www.fintechfestival.sg/",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } else if (node === "festival-ibm") {

        messageData = {
            attachment: {
                type: "template",
                payload: {
                    template_type: "generic",
                    elements:[    {
                        title: "IBM @ SG FinTech Festival",
                        image_url: "http://photos1.meetupstatic.com/photos/event/b/b/c/4/600_455028068.jpeg",
                        item_url: "http://www-935.ibm.com/industries/sg-en/banking/events/fintech-overview.html",
                        //subtitle: text,
                        buttons: [
                            {
                            type: "web_url",
                            url: "http://www-935.ibm.com/industries/sg-en/banking/events/fintech-overview.html",
                            title: "Website"
                            }             
                        ]
                    } ]
                }
            }   
        }

    } 
    
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        } else {
            console.log("success");
        }

    });
};

function sendImage(sender,text) {

    messageData = {
        attachment: {
            type: "template",
            payload: {
                template_type: "generic",
                elements:[    {
                    title: "Welcome to IBM Fintech Festival",
                    item_url: "https://www.ibm.com",
                    image_url: "http://www-03.ibm.com/ibm/history/ibm100/images/icp/J979425O75045Y27/us__en_us__ibm100__making_ibm__icon__200x120.png",
                    subtitle: text,
                    buttons: [
                        {
                        "type":"web_url",
                        "url":"https://www.ibm.com",
                        "title":"View Website"
                        },
                        {
                            "type":"postback",
                            "title":"Start Chatting",
                            "payload":"DEVELOPER_DEFINED_PAYLOAD"
                        }              
                    ]
                } 
                ]
            }
        }
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });
};


// This function receives the response text and sends it back to the user //
function sendMessage(sender,text) {

    //data_text.replace("^name^",user);

    messageData = {

        text: text
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token: token},
        method: 'POST',
        json: {
            recipient: {id: sender},
            message: messageData,
            //image_url: 'http://www-03.ibm.com/ibm/history/ibm100/images/icp/J979425O75045Y27/us__en_us__ibm100__making_ibm__icon__200x120.png'

        }
    }, function (error, response, body) {
        if (error) {
            console.log('Error sending message: ', error);
        } else if (response.body.error) {
            console.log('Error: ', response.body.error);
        }
    });
};
var token = "FB_TOKEN";
var host = (process.env.VCAP_APP_HOST || 'localhost');
var port = (process.env.VCAP_APP_PORT || 3000);
app.listen(port, host);