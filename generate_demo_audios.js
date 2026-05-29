import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is not defined.');
  process.exit(1);
}

// Dialogues matching the frontend play lists
const dialogues = {
  dental: [
    { speaker: 'agent', text: "Thank you for calling Smiles Dental Clinic. I am Aura, your AI receptionist. How can I help you today?" },
    { speaker: 'caller', text: "Hi, um, I would like to book an appointment for a teeth cleaning next Thursday." },
    { speaker: 'agent', text: "No problem! Let me check the schedule... next Thursday is May 28th. We have openings at 10:00 AM, 2:00 PM, and 4:30 PM. Which one is good for you?" },
    { speaker: 'caller', text: "Oh, 2:00 PM works great." },
    { speaker: 'agent', text: "Perfect! Can I get your full name and phone number to secure the slot?" },
    { speaker: 'caller', text: "Yes, sure. My name is John Doe and my number is 9 1 2 3, 4 5 6 7." },
    { speaker: 'agent', text: "Got it, John. I've booked you in with Dr. Lim for your teeth cleaning next Thursday, May 28th at 2:00 PM already. A confirmation SMS is on the way!" }
  ],
  plumber: [
    { speaker: 'agent', text: "QuickFlow Plumbing Services, this is Aura here. Are you calling for emergency repair or routine service?" },
    { speaker: 'caller', text: "Hi, my kitchen sink is leaking heavily, water is going everywhere! Can you get someone here today?" },
    { speaker: 'agent', text: "Oh dear, that sounds urgent. I can dispatch a plumber to your location within 2 hours. Our emergency call-out fee is 85 dollars, including the first 30 minutes of diagnostic work. Can I book this emergency dispatch for you?" },
    { speaker: 'caller', text: "Yes, please! Send them as soon as possible." },
    { speaker: 'agent', text: "Sure. Please give me your address and contact number." },
    { speaker: 'caller', text: "I'm at 12 Orchid Drive, and my number is 8 2 3 4, 5 6 7 8." },
    { speaker: 'agent', text: "Thank you. Plumber Dave will head to 12 Orchid Drive already. He should arrive before 4:30 PM today and will call you when he's 10 minutes away." }
  ],
  realestate: [
    { speaker: 'agent', text: "Welcome to Apex Realty. I am Aura, your virtual property agent. Are you calling to rent or buy property?" },
    { speaker: 'caller', text: "Hi, I saw a listing for the 3-bedroom condo at Marina Bay Residences. Is it still available for viewing?" },
    { speaker: 'agent', text: "Yes, the Marina Bay 3-bedroom unit is still available. Viewings are open this Saturday at 11:00 AM or 3:00 PM. Which time is good for you?" },
    { speaker: 'caller', text: "Let's do 3:00 PM on Saturday." },
    { speaker: 'agent', text: "Great! Can I get your name, email, and mobile number to register your slot with the agent?" },
    { speaker: 'caller', text: "Sure, I'm Sarah Connor. Email is sarah at sky dot net and mobile is 9 8 7 6, 5 4 3 2." },
    { speaker: 'agent', text: "Thank you, Sarah. I have booked your Saturday 3:00 PM viewing already. I've sent the location details and agent contact to your phone." }
  ],
  restaurant: [
    { speaker: 'agent', text: "Thank you for calling Bistro-on-the-Hill. This is Aura, your booking assistant. Would you like to reserve a table?" },
    { speaker: 'caller', text: "Hi, yes, I'd like to book a table for four people for this Friday evening at 7:30 PM." },
    { speaker: 'agent', text: "Let me check... yes, we have a table for four available at 7:30 PM this Friday. Would you prefer indoor or outdoor dining?" },
    { speaker: 'caller', text: "Indoor dining, please." },
    { speaker: 'agent', text: "Perfect. May I have your name and contact number for the reservation?" },
    { speaker: 'caller', text: "My name is David, and my phone number is 9 2 2 2, 8 8 8 8." },
    { speaker: 'agent', text: "Alright, David. Your table for four is reserved for this Friday at 7:30 PM indoors. See you then!" }
  ],
  hotel: [
    { speaker: 'agent', text: "Apex Grand Hotel front desk, Aura speaking. How can I assist you with your reservation today?" },
    { speaker: 'caller', text: "Hi, I'd like to check room availability for next weekend, checking in on Friday and checking out on Sunday." },
    { speaker: 'agent', text: "Checking next weekend... yes, we have Deluxe Rooms and Executive Suites available. Which room type would you prefer?" },
    { speaker: 'caller', text: "A Deluxe Room is fine. What is the nightly rate?" },
    { speaker: 'agent', text: "The Deluxe Room is 250 dollars per night. Shall I proceed to book this room for your stay?" },
    { speaker: 'caller', text: "Yes, please." },
    { speaker: 'agent', text: "Wonderful. Can I have your name, email, and phone number to complete the booking?" },
    { speaker: 'caller', text: "Sure, my name is Alex, email is alex at gmail dot com and number is 8 1 1 1, 9 9 9 9." },
    { speaker: 'agent', text: "Thank you, Alex. I have reserved your Deluxe Room check-in next Friday, check-out Sunday. A confirmation email has been sent!" }
  ]
};

async function generateSpeech(text, voice) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS Error: ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const assetsDir = path.join(process.cwd(), 'public', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  for (const [industry, turns] of Object.entries(dialogues)) {
    console.log(`Generating clean audio for ${industry}...`);
    const buffers = [];

    for (const turn of turns) {
      // Use female 'shimmer' for agent, male 'onyx' for caller
      const voice = turn.speaker === 'agent' ? 'shimmer' : 'onyx';
      try {
        const audioBuffer = await generateSpeech(turn.text, voice);
        buffers.push(audioBuffer);
      } catch (err) {
        console.error(`Failed to generate turn: "${turn.text}"`, err);
      }
    }

    const combinedBuffer = Buffer.concat(buffers);
    const outFile = path.join(assetsDir, `demo_${industry}.mp3`);
    fs.writeFileSync(outFile, combinedBuffer);
    console.log(`Saved clean file: ${outFile}`);
  }

  console.log('All audio files generated successfully in public/assets/');
}

main().catch(console.error);
