//
// This script runs hourly and emails people as necessary
//

var mongo = require('mongodb')
  , time = require('time')
  , tzdata = require('./tzdata.js')

// Figure out where it's between 3 and 4am right now

function timeToSend(t) {
  if (!t) return false;
  return t.getHours() == 3;
}

for(var i=0; i < tzdata.names.length; i++) {
  var name = tzdata.names[i];
  // get time for this offset
  var t = new time.Date();
  try {
    t.setTimezone(name);
  }
  catch(e) { continue; }

  if (timeToSend(t)) {
    console.log('Time to send in', name);

    // execute job for these places!
  }
}
