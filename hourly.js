//
// This script runs hourly and emails people as necessary
//

var mongo = require('mongodb')
  , time = require('time')

// Figure out where it's between 3 and 4am right now

function timeToSend(t) {
  return t.getHours() > 3 && t.getHours() < 4;
}

// there are some fucking weird time zones
OFFSETS = [-12, -11, -10, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 2,
        3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 7, 8, 9, 9.5, 10, 11, 12];

var now = new time.Date();
now.setTimezone('UTC');

for(var i=0; i < OFFSETS.length; i++) {
  var offset = OFFSETS[i];

  // get time for this offset


}
