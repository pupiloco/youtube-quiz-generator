async function getTranscript() {
    // First try the "..." menu method
    try {
        // Click the "..." button
        const moreButton = await waitForElement('button.ytp-button[aria-label="More actions"]');
        if (moreButton) {
            moreButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Look for "Show transcript" in the menu
        const menuItems = document.querySelectorAll('tp-yt-paper-item');
        const transcriptButton = Array.from(menuItems)
            .find(el => el.textContent.toLowerCase().includes('show transcript'));
        
        if (transcriptButton) {
            transcriptButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.log('First method failed, trying alternative...');
    }

    // Try alternative method - direct transcript button
    try {
        const transcriptButton = await waitForElement('button[aria-label="Show transcript"]');
        if (transcriptButton) {
            transcriptButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    } catch (error) {
        console.log('Alternative method failed...');
    }

    // Wait for transcript panel to appear and get text
    try {
        // Try multiple selectors for transcript text
        const selectors = [
            'ytd-transcript-segment-renderer',
            'ytd-transcript-segment-list-renderer',
            '.segment-text',
            '.cue-group',
            '.ytd-transcript-body-renderer'
        ];

        let transcriptText = '';
        for (const selector of selectors) {
            const elements = await waitForElements(selector, 2000);
            if (elements && elements.length > 0) {
                transcriptText = Array.from(elements)
                    .map(el => el.textContent.trim())
                    .join(' ');
                if (transcriptText) break;
            }
        }

        if (!transcriptText) {
            // If no transcript, try extracting from video description and title
            const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent || '';
            const description = document.querySelector('ytd-expander#description')?.textContent || '';
            
            if (title || description) {
                return `Title: ${title}\n\nDescription: ${description}`;
            }
            
            throw new Error('No transcript or description found');
        }

        return transcriptText;
    } catch (error) {
        throw new Error('Could not find transcript. Please ensure the video has captions enabled.');
    }
}

// Helper function to wait for an element
function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

// Helper function to wait for multiple elements
function waitForElements(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            resolve(elements);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                obs.disconnect();
                resolve(elements);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(document.querySelectorAll(selector)); // Resolve with whatever we found
        }, timeout);
    });
}

async function generateQuestionsWithGemini(transcript, videoTitle, apiKey) {
    const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

    // Truncate transcript if too long
    const maxLength = 4000;
    const truncatedTranscript = transcript.length > maxLength 
        ? transcript.slice(0, maxLength) + '...' 
        : transcript;

    const prompt = `
        You are a quiz generator for YouTube videos. Generate 5 multiple choice questions based on this video content:
        
        Title: ${videoTitle}
        
        Content: ${truncatedTranscript}
        
        Create challenging but fair questions that test understanding of the main concepts discussed.
        Even if the content is limited, try to generate meaningful questions about the topic.
        Format your response as a JSON array of question objects with this exact structure:
        [
            {
                "question": "Question text here?",
                "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
                "correct": 0
            }
        ]
        
        The "correct" field should be the index (0-3) of the correct answer in the options array.
        Return only the JSON array, no other text.
    `;

    const response = await fetch(`${API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }]
        })
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    try {
        const questionsText = data.candidates[0].content.parts[0].text;
        return JSON.parse(questionsText);
    } catch (error) {
        throw new Error('Failed to parse AI response: ' + error.message);
    }
}

async function generateQuizContent(apiKey) {
    try {
        const transcript = await getTranscript();
        if (!transcript) {
            return { error: 'Could not find video content' };
        }
        
        const videoTitle = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim();
        const questions = await generateQuestionsWithGemini(transcript, videoTitle, apiKey);
        
        return { questions };
    } catch (error) {
        return { error: error.message };
    }
}
