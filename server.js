/**
 * Discussion Agent — LTI 1.1 Tool Provider + Canvas Submission Proxy
 * 
 * Stack: Node.js + Express + ims-lti
 * Deploy to: Vercel, Render, Railway, or any Node host
 */

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const lti = require('ims-lti');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// LTI LAUNCH ENDPOINT
// Canvas POSTs here when a student opens the tool
// ─────────────────────────────────────────────
app.post('/lti/launch', (req, res) => {
  const provider = new lti.Provider(
    process.env.LTI_KEY,       // Must match what you enter in Canvas
    process.env.LTI_SECRET     // Must match what you enter in Canvas
  );

  provider.valid_request(req, (err, isValid) => {
    if (!isValid) {
      console.error('LTI validation failed:', err);
      return res.status(401).send('LTI launch validation failed. Check your key/secret.');
    }

    // Pull context from Canvas LTI params
    const params = req.body;
    const launchData = {
      userId:        params.user_id,
      userName:      params.lis_person_fullname || params.lis_person_name_given || 'Student',
      courseId:      params.custom_canvas_course_id || params.context_id,
      courseName:    params.context_title || 'Your Course',
      assignmentId:  params.custom_canvas_assignment_id || '',
      returnUrl:     params.launch_presentation_return_url || '',
      outcomeUrl:    params.lis_outcome_service_url || '',
      resultSourcedId: params.lis_result_sourcedid || '',
      // Custom params set in Canvas XML config (see canvas_config.xml)
      weekLabel:     params.custom_week_label || 'This Week',
      question:      params.custom_discussion_question || process.env.DEFAULT_QUESTION || 'What are the key tensions in this week\'s readings?',
      facilitatorRole: params.custom_facilitator_role || process.env.DEFAULT_ROLE || 'socratic',
    };

    // Encode launch data into the redirect so the client page can read it
    const encoded = Buffer.from(JSON.stringify(launchData)).toString('base64');
    res.redirect(`/?launch=${encoded}`);
  });
});

// ─────────────────────────────────────────────
// ANTHROPIC PROXY
// Keeps your API key server-side (never exposed to browser)
// ─────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    res.json({ reply: data.content?.[0]?.text || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// CANVAS SUBMISSION PROXY
// Forwards transcript to Canvas API server-side
// (avoids CORS issues when calling Canvas from browser)
// ─────────────────────────────────────────────
app.post('/api/submit', async (req, res) => {
  const { canvasBaseUrl, canvasToken, courseId, assignmentId, userId, transcript } = req.body;

  if (!canvasBaseUrl || !canvasToken || !courseId || !assignmentId || !userId || !transcript) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const endpoint = `${canvasBaseUrl.replace(/\/$/, '')}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${canvasToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        submission: {
          submission_type: 'online_text_entry',
          body: `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">${transcript.replace(/</g, '&lt;')}</pre>`,
          user_id: parseInt(userId),
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.errors?.[0]?.message || JSON.stringify(data) });
    }
    res.json({ success: true, submission: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Discussion Agent running on port ${PORT}`));
