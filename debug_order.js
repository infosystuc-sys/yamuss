
import http from 'http';

const id = 'A0000700017348';
const url = `http://localhost:3002/api/orders/${id}`;

console.log(`Fetching ${url}...`);

http.get(url, (res) => {
    console.log(`Status Code: ${res.statusCode}`);
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log("Body:", data);
    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
