$(function() {

  $('#submit').on('click', function() {
    var email = $('#email').val();
    if ($.trim(email) == '')
      return false;


    $.post('/signup', {'email': email}, function(data) {
      if (data.success) {
        $('#success-body').text('Thanks, ' + email + '! You\'ll start getting emails tomorrow morning.');
        $('#success-modal').modal();
        $('#email').val('');
      }
      else {
        alert("Something went wrong and we couldn't add you, sorry :(");
      }
    }).error(function() {
      alert("Something went wrong and we couldn't add you, sorry :(");
    });

    return false;
  });
});
