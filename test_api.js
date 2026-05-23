
import http from 'http';

const req = http.get('http://localhost:3002/api/orders/OP-0001/retentions', (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`BODY: ${data}`);
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});
