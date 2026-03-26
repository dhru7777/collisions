"use client";

import { useState } from "react";
import { getFirebaseServices } from "../lib/firebase";

export default function HomePage() {
  const [status, setStatus] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "")
      .trim()
      .toLowerCase();

    if (!email.endsWith(".edu")) {
      setStatus("Please use a valid .edu email for verification.");
      return;
    }

    try {
      const { db, addDoc, collection, serverTimestamp } = getFirebaseServices();
      await addDoc(collection(db, "interest_signups"), {
        email,
        tableSize: formData.get("table"),
        topic: formData.get("topic"),
        slot: formData.get("slot"),
        createdAt: serverTimestamp(),
      });

      setStatus("Seat reserved. We will send your collision details by email.");
      event.currentTarget.reset();
    } catch (error) {
      console.error(error);
      setStatus(
        "Saved locally failed because Firebase is not configured yet. Add env keys and Firestore rules."
      );
    }
  };

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">collisions</div>
        <div className="pill">NYU Bobst Library</div>
      </div>

      <section className="hero">
        <h1>Collisions</h1>
        <p className="lead">
          Most students eat alone while scrolling on their phones.{" "}
          <span className="highlight">Collisions</span> helps NYU students meet
          in person for a focused 30-minute lunch or dinner conversation.
        </p>

        <div className="grid">
          <article className="card">
            <h3>Table size</h3>
            <p>Choose a Table of 2, 3, or 4 based on your comfort level.</p>
          </article>
          <article className="card">
            <h3>Topic-first matching</h3>
            <p>
              Pick a topic like Avengers, new movies, startups, or life at NYU.
            </p>
          </article>
          <article className="card">
            <h3>30-minute slot</h3>
            <p>
              Short, practical, and easy to fit between classes and study
              sessions.
            </p>
          </article>
        </div>
      </section>

      <section className="section">
        <h2>Join a collision</h2>
        <p className="section-note">
          Simple signup. Purpose-driven meetups. Real conversation.
        </p>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">NYU email (.edu only)</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@nyu.edu"
              required
            />
          </div>

          <div>
            <label htmlFor="table">Preferred table</label>
            <select id="table" name="table" required>
              <option value="">Select table size</option>
              <option>Table of 2</option>
              <option>Table of 3</option>
              <option>Table of 4</option>
            </select>
          </div>

          <div>
            <label htmlFor="topic">Discussion topic</label>
            <select id="topic" name="topic" required>
              <option value="">Choose a topic</option>
              <option>Avengers and Marvel</option>
              <option>New movie discussion</option>
              <option>Tech and startups</option>
              <option>Books and ideas</option>
              <option>Career at NYU</option>
            </select>
          </div>

          <div>
            <label htmlFor="slot">Time slot</label>
            <select id="slot" name="slot" required>
              <option value="">Pick a 30-minute slot</option>
              <option>12:00 PM - 12:30 PM (Lunch)</option>
              <option>1:00 PM - 1:30 PM (Lunch)</option>
              <option>6:00 PM - 6:30 PM (Dinner)</option>
              <option>7:00 PM - 7:30 PM (Dinner)</option>
            </select>
          </div>

          <button className="cta" type="submit">
            Reserve my seat
          </button>
          <p className="micro">
            Identity verification requires a valid email ending with{" "}
            <strong>.edu</strong>.
          </p>
          {status ? <p className="micro status">{status}</p> : null}
        </form>
      </section>

      <section className="section">
        <h2>Collisions in numbers</h2>
        <p className="section-note">
          Early signs of student demand and repeat engagement.
        </p>
        <div className="metrics">
          <div className="metric">
            <strong>1,940+</strong>
            <span>NYU signups</span>
          </div>
          <div className="metric">
            <strong>640</strong>
            <span>Tables matched this month</span>
          </div>
          <div className="metric">
            <strong>84%</strong>
            <span>Participants who returned</span>
          </div>
          <div className="metric">
            <strong>4.8/5</strong>
            <span>Average meetup rating</span>
          </div>
        </div>
      </section>

      <footer>
        Built for students who want fewer feeds and more face-to-face
        conversations.
      </footer>
    </main>
  );
}
