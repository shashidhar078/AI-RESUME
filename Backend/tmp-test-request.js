const request = require('supertest');
const app = require('./src/app');
const connectToDB = require('./src/config/database');

(async () => {
  await connectToDB();
  const res = await request(app)
    .post('/api/interview/')
    .field('jobDescription', 'Senior React developer')
    .field('selfDescription', 'I am a frontend developer')
    .attach('resume', Buffer.from('%PDF-1.4\n%test'), 'resume.pdf');

  console.log(JSON.stringify({ status: res.status, body: res.body }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
