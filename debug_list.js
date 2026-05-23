
import http from 'http';

console.log("Fetching list of orders from API...");

http.get('http://localhost:3002/api/orders', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const orders = JSON.parse(data);
            console.log(`Received ${orders.length} orders.`);
            orders.forEach(o => {
                console.log(`ID: '${o.id}', Number: '${o.number}', Provider: ${o.provider}`);
            });
        } catch (e) {
            console.error("Error parsing JSON:", e);
            console.log("Raw body:", data);
        }
    });
}).on('error', (e) => {
    console.error("Error:", e.message);
});
