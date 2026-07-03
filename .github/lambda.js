function handler(event) {
  var req = event.request;
  var host = req.headers.host.value;
  if (host === `${BASE_URL}`) {
    var qs = req.querystring;
    var q = Object.keys(qs).map(function (k) {
      return qs[k].value ? k + '=' + qs[k].value : k;
    }).join('&');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: `https://www.${BASE_URL}` + req.uri + (q ? '?' + q : '') } }
    };
  }
  return req;
}
