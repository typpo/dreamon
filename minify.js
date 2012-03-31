// minifcation
(function() {
  files = fs.readdirSync(path.join(__dirname, 'public/js'));
  var all_src = '';
  var minify = _.filter(files, function(f) {
    return (f.indexOf('.js') == f.length - 3 && f != 'bundle.js');
  }).map(function(f) {
    return path.join(__dirname, 'public/js', f);
  });
  var exec = require('child_process').exec;

  var closurelib = path.join(__dirname, '../lib/compiler.jar');
  var targets = minify.join(' ');
  var bundlepath = path.join(__dirname, '/public/js/bundle.js');
  var cmd = 'java -jar '
    + closurelib
    + ' --compilation_level SIMPLE_OPTIMIZATIONS --warning_level QUIET'
    + ' ' + targets + ' > ' + bundlepath;
  exec(cmd, function(err, stdout, stderr) {
    if (err) {
      console.log(stderr);
      process.exit();
    }
  });

  console.log('writing new minified js bundle..');
  fs.writeFileSync(path.join(__dirname, 'public/js/bundle.js'), all_src);
})();

