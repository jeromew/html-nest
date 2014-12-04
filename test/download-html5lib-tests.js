'use strict';

var fs = require('fs');
var gethub = require('gethub');

var requestedVersion = '11aec478545744fe89ba17bac70fbcacdd76922b';
var downloadedVersion = '';

try {
  downloadedVersion = fs.readFileSync(__dirname + '/html5lib-tests/version.txt', 'utf8');
} catch (ex) {
  // ignore non-existant version.txt file
}

if (downloadedVersion != requestedVersion) {
  gethub('html5lib', 'html5lib-tests', requestedVersion, __dirname + '/html5lib-tests', function (err) {
    if (err) throw err;
    fs.writeFileSync(__dirname + '/html5lib-tests/version.txt', requestedVersion);
  });
}
