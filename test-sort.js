const http = require('http');

http.get('http://localhost:3000/api/models?sort=name', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("Sorting by name:");
        console.log(parsed.models.map(m => m.name));
      }
    } catch(e) {
      console.error(e);
    }
  });
});

http.get('http://localhost:3000/api/models?sort=updated', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.models) {
        console.log("Sorting by updated:");
        console.log(parsed.models.map(m => m.name));
      }
    } catch(e) {
      console.error(e);
    }
  });
});
