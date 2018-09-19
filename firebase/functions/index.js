// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const fetch = require('node-fetch');
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const SpotifyWebApi = require('spotify-web-api-node');
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const userId = '5butodgv0iy83aosjzhw23f76';
//const spotify = new SpotifyWebApi();
//spotify.setAccessToken('BQDbw-RCGX5RxhJAWAxXk9JMTowrB3m1vo_uEOczIIXzoMRjE07NEyliJIHmM3wXO-wqKKGSMiaT_VMW1OTksokKpDDkd5Hdvia9UxUkPKpowbp1nI4Cw1UeLUQAPFWp3JO7oIxJ4OosxXd4oA4c6V6OtNmEGwTWy33q3aPGSJTJr7So1pkrszzdfH5bCQQbPg');
const spotify = new SpotifyWebApi({
  clientId: '888230b047b34777b4cabfb8b5105689',
  clientSecret: '8ae0ddde397e4faea707cecc1436800b',
  redirectUri: 'http://localhost:1000/'
});
spotify.setAccessToken('BQADGH5m5aVfsCODf9BjQdvW0F0Zlpw41munq_al70Io0_bjd6-SVSc2Y1JOiHzbeIl21fjxhge8Hxj5ve_SEGE8gsZECT4DQzIc9UyIkD7o8Sj0MCM2r6__AReLuO8cPdwqNoB6GCr9wiZFaNTxBgxdd59tLAm99cZ0mBtfgFsGWOY_dQUuw3Bt5B_KGrp-eBF5');

const refreshToken = 'AQCodOAo891_REhP0GhW13UqRIXBxjc0MAPfXD5NyUW9TLVA0gRDYIIBF-N8C-FdqOPf4a7q7DPUBARhPMgczCx9al646Zxl_Ko2ITzvtgxaraVvGTTjySbM3xwasO5iW6_D9w';
spotify.setRefreshToken(refreshToken);

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  const agent = new WebhookClient({ request, response });
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  
  function welcome(agent) {
    agent.add(`Welcome to my agent!`);
  }
 
  function hasValidParameters(parameters) {
    if (!parameters['track_attribute']) {
      console.error("Dialogflow Request does not contain the 'track_attribute' parameter: " + parameters);
      return false;
    }
    if (!parameters['attribute_value']) {
      console.error("Dialogflow Request does not contain the 'attribute_value' parameter: " + parameters);
      return false;
    }

    if (!parameters['genre']) {
      console.error("Dialogflow Request does not contain the 'genre' parameter: " + parameters);
      return false;
    }

    return true;
  }

  function newUUID(){
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }

  function getRecommendations(trackAttribute, attributeValue, genre){
    const recommendationParams = {limit: 100, seed_genres: [genre]};
    recommendationParams['target_' + trackAttribute] = attributeValue/100;
    return spotify.getRecommendations(recommendationParams);
  }

  function normalizeSpotifyResponse(response){
    return response.body;
  }

  function getTrackUrisFromRecommendations (tracks) {
    let trackUris = [];

    for (var i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      trackUris.push(track.uri);
    }

    return trackUris;
  }

  function addTracksToPlaylist(playlist, trackUris){
    return spotify.addTracksToPlaylist(playlist.id, trackUris);
  }

  function createPlaylist(){
    const playlistName = `Aqua Beagel Non-OAuth Playlist`;
    return spotify.createPlaylist(userId, playlistName, { 'public' : true });
  }

  async function verifyAccessToken(){
    console.log("Verifying Access");
    try {
      const me = await spotify.getMe();
      console.log("Access Verified: " + me);
    } catch (err) {
      console.warn("Auth probably expired, refreshing token", err);
      const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', body: "grant_type=refresh_token&refreshtoken=" + encodeURIComponent(refreshToken), headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': 'Basic ODg4MjMwYjA0N2IzNDc3N2I0Y2FiZmI4YjUxMDU2ODk6OGFlMGRkZGUzOTdlNGZhZWE3MDdjZWNjMTQzNjgwMGI='} });
      const json = await res.json();
      spotify.setAccessToken(json.access_token);
      console.log("Token Refreshed");
    }
  }

  async function generatePlaylist(trackAttribute, attributeValue, genre){

    try{
      await verifyAccessToken();
      console.log("Getting Recommendations");
      const recommendationResponse = await getRecommendations(trackAttribute, attributeValue, genre);
      const recommendations = normalizeSpotifyResponse(recommendationResponse);
      const trackUris = getTrackUrisFromRecommendations(recommendations.tracks)
      console.log(`Found ${trackUris.length} recommendations.`);

      console.log('Creating Playlist');
      const playlistResponse = await createPlaylist();
      const playlist = normalizeSpotifyResponse(playlistResponse);
      console.log('Playlist Created: ' + playlist);

      console.log('Adding Tracks to Playlist');
      await addTracksToPlaylist(playlist, trackUris);
      console.log('Tracks Added');

      return playlist.external_urls.spotify;
    } catch(err) {
        console.error('Something went wrong!', err);
        throw err;
    }
  }

  function buildPlaylistResponse(parameters, playlistUrl){
    return `Here is your ${parameters['genre']} playlist with ${parameters['track_attribute']} @ ${parameters['attribute_value']}%: ${playlistUrl}`;
  }

  async function playlistHandler(agent) {
    const parameters = agent.parameters;
    console.log(parameters);

    if (!hasValidParameters(parameters)) {
      return fallback(agent);
    }

    let playlistUrl = await generatePlaylist(parameters['track_attribute'], parameters['attribute_value'], parameters['genre']);

    agent.add(buildPlaylistResponse(parameters, playlistUrl));
  }
 
  function buildOAuthResponse(parameters){
    const trackAttribute = encodeURIComponent(parameters['track_attribute']);
    const attributeValue = encodeURIComponent(parameters['attribute_value']);
    const genre = encodeURIComponent(parameters['genre']);
    const oAuthUrl = `https://spotify-aqua-beagle.netlify.com/#/?track_attribute=${trackAttribute}&attribute_value=${attributeValue}&genre=${genre}`;
    return `Click here to view your playlist. ${oAuthUrl}`;
  }

  function oAuthHandler(agent){
    const parameters = agent.parameters;
    console.log(parameters);

    if (!hasValidParameters(parameters)) {
      return fallback(agent);
    }

    agent.add(buildOAuthResponse(parameters));
  }

  function fallback(agent) {
    agent.add(`I didn't understand`);
    agent.add(`I'm sorry, can you try again?`);
  }

  // // Uncomment and edit to make your own intent handler
  // // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
  // // below to get this function to be run when a Dialogflow intent is matched
  // function yourFunctionHandler(agent) {
  //   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
  //   agent.add(new Card({
  //       title: `Title: this is a card title`,
  //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
  //       buttonText: 'This is a button',
  //       buttonUrl: 'https://assistant.google.com/'
  //     })
  //   );
  //   agent.add(new Suggestion(`Quick Reply`));
  //   agent.add(new Suggestion(`Suggestion`));
  //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
  // }

  // // Uncomment and edit to make your own Google Assistant intent handler
  // // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
  // // below to get this function to be run when a Dialogflow intent is matched
  // function googleAssistantHandler(agent) {
  //   let conv = agent.conv(); // Get Actions on Google library conv instance
  //   conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
  //   agent.add(conv); // Add Actions on Google library responses to your agent's response
  // }
  // // See https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
  // // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample

  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();
  intentMap.set('Default Welcome Intent', welcome);
  intentMap.set('Default Fallback Intent', fallback);
  intentMap.set('Default Welcome Intent - Get Playlist', oAuthHandler);
  intentMap.set('NoOAuth - Get Playlist', playlistHandler);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});
