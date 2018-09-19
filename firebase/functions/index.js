// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const SpotifyWebApi = require('spotify-web-api-node');
 
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const userId = '5butodgv0iy83aosjzhw23f76';
const spotify = new SpotifyWebApi();
spotify.setAccessToken('BQDbw-RCGX5RxhJAWAxXk9JMTowrB3m1vo_uEOczIIXzoMRjE07NEyliJIHmM3wXO-wqKKGSMiaT_VMW1OTksokKpDDkd5Hdvia9UxUkPKpowbp1nI4Cw1UeLUQAPFWp3JO7oIxJ4OosxXd4oA4c6V6OtNmEGwTWy33q3aPGSJTJr7So1pkrszzdfH5bCQQbPg');

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
    return spotify.addTracksToPlaylist(userId, playlist.id, trackUris);
  }

  function createPlaylist(){
    const playlistName = `Dynamic Playlist ${newUUID()}`;
    return spotify.createPlaylist(userId, playlistName, { 'public' : true });
  }

  async function generatePlaylist(trackAttribute, attributeValue, genre){

    try{
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
        console.log('Something went wrong!', err);
        throw err;
    }
  }

  function buildPlaylistResponse(parameters, playlistUrl){
    return `Here is your playlist with ${parameters['track_attribute']} @ ${parameters['attribute_value']}%: ${playlistUrl}`;
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
    const oAuthUrl = `https://spotify-aqua-beagle.netlify.com/?track_attribute=${trackAttribute}&attribute_value=${attributeValue}&genre=${genre}`;
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
  intentMap.set('Default Welcome Intent - Get Playlist', playlistHandler);
  // intentMap.set('your intent name here', googleAssistantHandler);
  agent.handleRequest(intentMap);
});
