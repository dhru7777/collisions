"use client";

import { useEffect, useRef, useState } from "react";
import { getFirebaseServices } from "../lib/firebase";

const LOCATION_OPTIONS = [
  "Bobst - Lobby Cafe",
  "Bobst - Lower Level Commons",
  "Bobst - 2nd Floor Quiet Lounge",
  "Bobst - 3rd Floor Collaboration Zone",
  "Bobst - Any open table near entrance",
  "Bobst - Your custom location",
];

const SLOT_OPTIONS = [
  {
    id: "lunch-1200",
    label: "12:00 PM - 12:30 PM (Lunch)",
    startMinutes: 12 * 60,
    endMinutes: 12 * 60 + 30,
  },
  {
    id: "lunch-1300",
    label: "1:00 PM - 1:30 PM (Lunch)",
    startMinutes: 13 * 60,
    endMinutes: 13 * 60 + 30,
  },
  {
    id: "dinner-1800",
    label: "6:00 PM - 6:30 PM (Dinner)",
    startMinutes: 18 * 60,
    endMinutes: 18 * 60 + 30,
  },
  {
    id: "dinner-1900",
    label: "7:00 PM - 7:30 PM (Dinner)",
    startMinutes: 19 * 60,
    endMinutes: 19 * 60 + 30,
  },
];

const TOPIC_OPTIONS = [
  "Avengers and Marvel",
  "New movie discussion",
  "Tech and startups",
  "Books and ideas",
  "Career at NYU",
  "Hot take: Is social media helping or harming college life?",
  "Nepo babies debate: unfair advantage or overblown narrative?",
  "AI in class: productivity hack or creativity killer?",
  "Best and worst NYC date ideas under $20",
  "What trend will Gen Z regret in 10 years?",
  "Is hustle culture dead?",
  "Campus friendships vs online friendships",
  "Most overrated movie franchise right now",
];

const DRAFT_KEY = "collisions_pending_table";
const EMAIL_KEY = "collisions_email_for_signin";
const JOIN_DRAFT_KEY = "collisions_pending_join";
const CALENDAR_TZ = "America/New_York";
const NOTIFICATIONS_KEY = "collisions_notifications";
const BLOCKED_WORDS = [
  "hate",
  "racist",
  "violence",
  "kill",
  "abuse",
  "porn",
  "explicit",
];

const isTestingEmailMode = process.env.NEXT_PUBLIC_ALLOW_NON_EDU === "true";

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getSlotById(slotId) {
  return SLOT_OPTIONS.find((slot) => slot.id === slotId) || null;
}

function isAllowedEmail(email) {
  if (!email) return false;
  if (isTestingEmailMode) return true;
  return email.endsWith(".edu");
}

function getFriendlyFirebaseError(error, fallbackMessage) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) {
    return fallbackMessage;
  }
  return error?.message || fallbackMessage;
}

function formatGoogleDate(dateIso, minutesFromMidnight) {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setMinutes(minutesFromMidnight);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${min}00`;
}

function createGoogleCalendarLink({ topic, dateIso, slotId, location, details }) {
  const slot = getSlotById(slotId);
  if (!slot) return "";
  const start = formatGoogleDate(dateIso, slot.startMinutes);
  const end = formatGoogleDate(dateIso, slot.endMinutes);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Collisions: ${topic}`,
    dates: `${start}/${end}`,
    details,
    location,
    ctz: CALENDAR_TZ,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function isTableUpcoming(table) {
  if (!table.meetingDate || !table.slotId) return true;
  const slot = getSlotById(table.slotId);
  if (!slot) return true;
  const now = new Date();
  const meeting = new Date(`${table.meetingDate}T00:00:00`);
  meeting.setMinutes(slot.endMinutes);
  return meeting.getTime() >= now.getTime();
}

export default function HomePage() {
  const [status, setStatus] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [blinkBanner, setBlinkBanner] = useState(false);
  const [showJoinHelp, setShowJoinHelp] = useState(false);
  const [showCreateHelp, setShowCreateHelp] = useState(false);
  const [showFeedbackSection, setShowFeedbackSection] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [tables, setTables] = useState([]);
  const [joinBusyId, setJoinBusyId] = useState("");
  const [activeJoinTableId, setActiveJoinTableId] = useState("");
  const [joinForm, setJoinForm] = useState({
    email: "",
    alias: "",
    note: "",
  });
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const feedbackSectionRef = useRef(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(NOTIFICATIONS_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        setNotifications(parsed);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    if (!status) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message: status,
      createdAt: new Date().toISOString(),
    };
    setNotifications((prev) => {
      const next = [entry, ...prev].slice(0, 20);
      window.localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(next));
      return next;
    });
    setBlinkBanner(true);
    const timer = window.setTimeout(() => setBlinkBanner(false), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const services = getFirebaseServices();
    const {
      auth,
      onAuthStateChanged,
      isSignInWithEmailLink,
      signInWithEmailLink,
      query,
      collection,
      where,
      onSnapshot,
      db,
    } = services;

    const maybeCompleteEmailLink = async () => {
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        return;
      }

      const storedEmail = window.localStorage.getItem(EMAIL_KEY);
      const email = storedEmail || window.prompt("Confirm your NYU email:");
      if (!email) {
        setStatus("Email verification canceled.");
        return;
      }

      await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem(EMAIL_KEY);
      window.history.replaceState({}, document.title, window.location.pathname);
      setStatus("Email verified. Your profile is confirmed.");
    };

    maybeCompleteEmailLink().catch((error) => {
      console.error(error);
      setStatus("Could not complete email verification. Try again.");
    });

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });

    const tablesQuery = query(
      collection(db, "tables"),
      where("status", "==", "confirmed")
    );

    const unsubTables = onSnapshot(tablesQuery, (snapshot) => {
      const nextTables = snapshot.docs.map((tableDoc) => ({
        id: tableDoc.id,
        ...tableDoc.data(),
      })).filter(isTableUpcoming);

      nextTables.sort((a, b) => {
        const aTs = a.createdAt?.seconds || 0;
        const bTs = b.createdAt?.seconds || 0;
        return bTs - aTs;
      });

      setTables(nextTables);
    });

    return () => {
      unsubAuth();
      unsubTables();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !currentUser) {
      return;
    }

    const draftRaw = window.localStorage.getItem(DRAFT_KEY);
    if (!draftRaw) {
      return;
    }

    const draft = JSON.parse(draftRaw);
    if (!draft || !draft.hostEmail || draft.hostEmail !== currentUser.email) {
      return;
    }

    createTableInFirestore(draft, currentUser)
      .then(() => {
        window.localStorage.removeItem(DRAFT_KEY);
        setStatus("Table confirmed and published after email verification.");
      })
      .catch((error) => {
        console.error(error);
        setStatus("Verified, but table creation failed. Please retry.");
      });
  }, [authReady, currentUser]);

  useEffect(() => {
    if (!authReady || !currentUser) {
      return;
    }

    const joinDraftRaw = window.localStorage.getItem(JOIN_DRAFT_KEY);
    if (!joinDraftRaw) {
      return;
    }

    const joinDraft = JSON.parse(joinDraftRaw);
    if (!joinDraft || joinDraft.email !== currentUser.email) {
      return;
    }

    joinTableInFirestore(joinDraft.tableId, joinDraft.alias, joinDraft.note, currentUser)
      .then(() => {
        window.localStorage.removeItem(JOIN_DRAFT_KEY);
        setStatus("Profile verified and table joined.");
        setActiveJoinTableId("");
        setJoinForm({ email: "", alias: "", note: "" });
      })
      .catch((error) => {
        console.error(error);
        setStatus(error.message || "Verified, but joining the table failed.");
      });
  }, [authReady, currentUser]);

  const getOpenSeats = (table) => {
    const attendees = Array.isArray(table.attendees) ? table.attendees.length : 0;
    return Math.max((table.maxSeats || 0) - attendees, 0);
  };

  const sendVerificationLink = async (email) => {
    const services = getFirebaseServices();
    const { auth, sendSignInLinkToEmail } = services;
    const urlBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    await sendSignInLinkToEmail(auth, email, {
      url: `${urlBase}/`,
      handleCodeInApp: true,
    });
    window.localStorage.setItem(EMAIL_KEY, email);
  };

  const queueConfirmationEmail = async (toEmail, payload) => {
    const services = getFirebaseServices();
    const { db, collection, addDoc } = services;

    const calendarLink = createGoogleCalendarLink({
      topic: payload.topic,
      dateIso: payload.meetingDate,
      slotId: payload.slotId,
      location: payload.location,
      details: payload.details,
    });
    if (!calendarLink) return;

    await addDoc(collection(db, "mail"), {
      to: [toEmail],
      message: {
        subject: `Collisions confirmed: ${payload.topic}`,
        text:
          `Your collision is confirmed.\n\n` +
          `Topic: ${payload.topic}\n` +
          `Date: ${payload.meetingDate}\n` +
          `Slot: ${payload.slotLabel}\n` +
          `Location: ${payload.location}\n\n` +
          `Add to Google Calendar:\n${calendarLink}`,
        html:
          `<p>Your collision is confirmed.</p>` +
          `<p><strong>Topic:</strong> ${payload.topic}<br/>` +
          `<strong>Date:</strong> ${payload.meetingDate}<br/>` +
          `<strong>Slot:</strong> ${payload.slotLabel}<br/>` +
          `<strong>Location:</strong> ${payload.location}</p>` +
          `<p><a href="${calendarLink}">Add to Google Calendar</a></p>`,
      },
    });
  };

  const createTableInFirestore = async (payload, user) => {
    const services = getFirebaseServices();
    const { db, collection, addDoc, serverTimestamp } = services;
    const hostAnonName = String(payload.hostAnonName || "").trim();
    const maxSeats = Number(payload.maxSeats);

    const slot = getSlotById(payload.slotId);
    const slotLabel = slot ? slot.label : payload.slotId;

    await addDoc(collection(db, "tables"), {
      topic: payload.topic,
      location: payload.location,
      slotId: payload.slotId,
      slotLabel,
      meetingDate: payload.meetingDate,
      maxSeats,
      hostAnonName,
      hostUid: user.uid,
      hostEmail: user.email,
      attendees: [
        {
          uid: user.uid,
          email: user.email,
          displayName: hostAnonName || "Host",
          isHost: true,
        },
      ],
      status: "confirmed",
      createdAt: serverTimestamp(),
    });

    await queueConfirmationEmail(user.email, {
      topic: payload.topic,
      meetingDate: payload.meetingDate,
      slotId: payload.slotId,
      slotLabel,
      location: payload.location,
      details: "Host confirmation for your collision table.",
    });
  };

  const handleCreateTable = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;

    const formData = new FormData(formElement);
    const email = String(formData.get("hostEmail") || "")
      .trim()
      .toLowerCase();
    const maxSeats = Number(formData.get("maxSeats"));
    const payload = {
      hostEmail: email,
      hostAnonName: String(formData.get("hostAnonName") || "").trim(),
      topic: String(formData.get("topic") || "").trim(),
      location: String(formData.get("location") || ""),
      slotId: String(formData.get("slotId") || ""),
      meetingDate: String(formData.get("meetingDate") || ""),
      maxSeats,
    };

    if (!isAllowedEmail(email)) {
      setStatus("Please use a valid .edu email for identity verification.");
      return;
    }

    if (maxSeats < 2 || maxSeats > 5) {
      setStatus("Host can set max seats between 2 and 5.");
      return;
    }
    if (!payload.topic) {
      setStatus("Please add a topic for discussion.");
      return;
    }
    if (!payload.meetingDate) {
      setStatus("Please select a date.");
      return;
    }
    if (!payload.slotId) {
      setStatus("Please select a 30-minute slot.");
      return;
    }
    if (!payload.location) {
      setStatus("Please select or type a Bobst location.");
      return;
    }
    const topicLower = payload.topic.toLowerCase();
    const badMatch = BLOCKED_WORDS.find((word) => topicLower.includes(word));
    if (badMatch) {
      setStatus("Please keep the topic clean and respectful.");
      return;
    }

    try {
      if (currentUser?.email === email) {
        await createTableInFirestore(payload, currentUser);
        setStatus("Table created and confirmed.");
        formElement.reset();
        return;
      }

      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
      await sendVerificationLink(email);
      setStatus(
        "Verification email sent. Open the link in your mail to confirm identity and publish the table."
      );
    } catch (error) {
      console.error(error);
      setStatus(getFriendlyFirebaseError(error, "Could not send verification email."));
    }
  };

  const joinTableInFirestore = async (tableId, alias, note, user) => {
    const services = getFirebaseServices();
    const { db, doc, runTransaction } = services;
    const tableRef = doc(db, "tables", tableId);

    return runTransaction(db, async (transaction) => {
      const snap = await transaction.get(tableRef);
      if (!snap.exists()) {
        throw new Error("This table no longer exists.");
      }

      const data = snap.data();
      const attendees = Array.isArray(data.attendees) ? data.attendees : [];
      const alreadyJoined = attendees.some((attendee) => attendee.uid === user.uid);
      if (alreadyJoined) {
        return { joined: false, reason: "already_joined" };
      }

      if (attendees.length >= data.maxSeats) {
        throw new Error("Table is full.");
      }

      const nextAttendees = [
        ...attendees,
        {
          uid: user.uid,
          email: user.email,
          displayName: alias || "Anonymous",
          note: note || "",
          isHost: false,
        },
      ];

      transaction.update(tableRef, {
        attendees: nextAttendees,
      });
      return { joined: true };
    });
  };

  const handleJoinSubmit = async (event, table) => {
    event.preventDefault();
    const email = joinForm.email.trim().toLowerCase();
    const alias = joinForm.alias.trim();
    const note = joinForm.note.trim();

    if (!isAllowedEmail(email)) {
      setStatus("Use a valid .edu email to join.");
      return;
    }
    if (!alias) {
      setStatus("Add an anonymous name.");
      return;
    }
    if (!note) {
      setStatus("Add a one-line discussion note.");
      return;
    }

    if (!currentUser || currentUser.email !== email) {
      window.localStorage.setItem(
        JOIN_DRAFT_KEY,
        JSON.stringify({ tableId: table.id, alias, note, email })
      );
      try {
        await sendVerificationLink(email);
        setStatus("Verification email sent. Click the link to complete join.");
      } catch (error) {
        console.error(error);
      setStatus(getFriendlyFirebaseError(error, "Could not send verification email."));
      }
      return;
    }

    setJoinBusyId(table.id);
    setStatus("");
    try {
      const joinResult = await joinTableInFirestore(
        table.id,
        alias,
        note,
        currentUser
      );
      if (joinResult?.joined) {
        await queueConfirmationEmail(currentUser.email, {
          topic: table.topic,
          meetingDate: table.meetingDate || getTodayIsoDate(),
          slotId: table.slotId,
          slotLabel: table.slotLabel || table.slotId || "30-minute slot",
          location: table.location || "Bobst Library",
          details: `You joined a table with note: ${note}`,
        });
        setStatus("You joined the table.");
      } else if (joinResult?.reason === "already_joined") {
        setStatus("You are already on this table.");
      } else {
        setStatus("Join request processed.");
      }
      setActiveJoinTableId("");
      setJoinForm({ email: "", alias: "", note: "" });
    } catch (error) {
      console.error(error);
      setStatus(getFriendlyFirebaseError(error, "Could not join table."));
    } finally {
      setJoinBusyId("");
    }
  };

  const handleSignOut = async () => {
    try {
      const services = getFirebaseServices();
      const { auth, signOut } = services;
      await signOut(auth);
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus("Could not sign out.");
    }
  };

  const openFeedbackSection = () => {
    setShowFeedbackSection(true);
    window.requestAnimationFrame(() => {
      feedbackSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleFeedbackSubmit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const rating = Number(formData.get("rating"));
    const feedback = String(formData.get("feedback") || "").trim();
    const featureRequest = String(formData.get("featureRequest") || "").trim();
    const contact = String(formData.get("contact") || "").trim().toLowerCase();
    const imageFile = formData.get("meetImage");

    if (!rating || rating < 1 || rating > 5) {
      setStatus("Please choose a rating from 1 to 5 stars.");
      return;
    }
    if (!feedback && !featureRequest) {
      setStatus("Please add feedback or a feature request.");
      return;
    }

    setFeedbackBusy(true);
    try {
      const services = getFirebaseServices();
      const {
        db,
        collection,
        addDoc,
        serverTimestamp,
        storage,
        ref,
        uploadBytes,
        getDownloadURL,
      } = services;

      let imageUrl = "";
      if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
        const filePath = `feedback-images/${Date.now()}-${imageFile.name}`;
        const imageRef = ref(storage, filePath);
        await uploadBytes(imageRef, imageFile);
        imageUrl = await getDownloadURL(imageRef);
      }

      await addDoc(collection(db, "feedback"), {
        rating,
        feedback,
        featureRequest,
        contact,
        imageUrl,
        createdAt: serverTimestamp(),
      });

      setStatus("Thanks! Your feedback was submitted.");
      formElement.reset();
      setShowFeedbackSection(false);
    } catch (error) {
      console.error(error);
      setStatus(getFriendlyFirebaseError(error, "Could not submit feedback."));
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">collisions</div>
        <div className="topbarRight">
          <div className="pill">NYU Bobst Library</div>
          <div className="miniStatus">
            <span className={`dot ${currentUser ? "ok" : "warn"}`} />
            <span className="miniText">{currentUser ? "Verified" : "Unverified"}</span>
            {isTestingEmailMode ? <span className="tag">Test</span> : null}
            {currentUser ? (
              <button className="textBtn miniBtn" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
          <div className="notifWrap">
            <button
              type="button"
              className="bellBtn"
              aria-label="Notifications"
              onClick={() => setShowNotifications((prev) => !prev)}
            >
              🔔
              {notifications.length > 0 ? <span className="notifCount">{notifications.length}</span> : null}
            </button>
            {showNotifications ? (
              <div className="notifPanel">
                {notifications.length === 0 ? (
                  <p>No notifications yet.</p>
                ) : (
                  notifications.map((item) => <p key={item.id}>{item.message}</p>)
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {status ? (
        <div className={`topNotice ${blinkBanner ? "blink" : ""}`}>{status}</div>
      ) : null}
      <div className="collideVisual" aria-hidden="true">
        <div className="ball left" />
        <div className="ball right" />
      </div>

      <section className="section split">
        <div>
          <div className="titleRow">
            <h2>Create a table</h2>
            <button
              type="button"
              className="helpBtn"
              aria-label="Create table help"
              onClick={() => setShowCreateHelp((prev) => !prev)}
            >
              ?
            </button>
          </div>
          {showCreateHelp ? (
            <p className="section-note helpNote">
              Host picks anonymous name, location, topic, 30-minute slot, and
              seat capacity (max 5).
            </p>
          ) : null}
          <form onSubmit={handleCreateTable}>
            <div className="inlineFields">
              <div>
                <label htmlFor="hostEmail">Host email (.edu)</label>
                <input
                  id="hostEmail"
                  name="hostEmail"
                  type="email"
                  placeholder="host@nyu.edu"
                  defaultValue={currentUser?.email || ""}
                  required
                />
              </div>
              <div>
                <label htmlFor="hostAnonName">Host anonymous name</label>
                <input
                  id="hostAnonName"
                  name="hostAnonName"
                  placeholder="Example: MidnightReader"
                  required
                />
              </div>
            </div>
            <div className="inlineFields">
              <div>
                <label htmlFor="maxSeats">Max seats (2 to 5)</label>
                <input
                  id="maxSeats"
                  name="maxSeats"
                  type="number"
                  min="2"
                  max="5"
                  defaultValue="4"
                  required
                />
              </div>
              <div>
                <label htmlFor="meetingDate">Date</label>
                <input
                  id="meetingDate"
                  name="meetingDate"
                  type="date"
                  min={getTodayIsoDate()}
                  defaultValue={getTodayIsoDate()}
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="createTopic">
                Discussion topic (choose one or type your own)
              </label>
              <input
                id="createTopic"
                name="topic"
                list="topic-suggestions"
                placeholder="Example: Is AI making us less original?"
                required
              />
              <datalist id="topic-suggestions">
                {TOPIC_OPTIONS.map((topic) => (
                  <option key={topic} value={topic} />
                ))}
              </datalist>
              <p className="micro">
                Keep it fun, open-minded, and respectful.
              </p>
            </div>
            <div>
              <label htmlFor="createLocation">Bobst location (choose or type)</label>
              <input
                id="createLocation"
                name="location"
                list="location-suggestions"
                placeholder="Example: 2nd floor window side table"
                required
              />
              <datalist id="location-suggestions">
                {LOCATION_OPTIONS.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="createSlot">30-minute slot</label>
              <select id="createSlot" name="slotId" required>
                <option value="">Choose slot</option>
                {SLOT_OPTIONS.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="cta" type="submit">
              Create table
            </button>
          </form>
        </div>

        <div>
          <div className="titleRow">
            <h2>Join existing table</h2>
            <button
              type="button"
              className="helpBtn"
              aria-label="Join table help"
              onClick={() => setShowJoinHelp((prev) => !prev)}
            >
              ?
            </button>
          </div>
          {showJoinHelp ? (
            <p className="section-note helpNote">
              Open tables are listed below. If seats are full, the table is
              marked full.
            </p>
          ) : null}
          <div className="tableList">
            {tables.length === 0 ? (
              <div className="tableCard">No confirmed tables yet.</div>
            ) : null}
            {tables.map((table) => {
              const openSeats = getOpenSeats(table);
              const isFull = openSeats === 0;
              const attendees = Array.isArray(table.attendees) ? table.attendees : [];
              const isAlreadyJoined = currentUser
                ? attendees.some((attendee) => attendee.uid === currentUser.uid)
                : false;
              return (
                <div key={table.id} className="tableCard">
                  <div className="tableTop">
                    <strong>{table.topic}</strong>
                    <span className={isFull ? "badge full" : "badge open"}>
                      {isFull ? "Full" : `${openSeats} seat(s) open`}
                    </span>
                  </div>
                  <p>
                    Host: {table.hostAnonName || "Host"} | Seats:{" "}
                    {attendees.length}/{table.maxSeats}
                  </p>
                  <p>
                    {table.meetingDate || "Today"} | {table.location} |{" "}
                    {table.slotLabel || table.slot || table.slotId || "30-minute slot"}
                  </p>
                  <button
                    className="cta"
                    type="button"
                    disabled={isFull || joinBusyId === table.id || isAlreadyJoined}
                    onClick={() => {
                      setActiveJoinTableId(table.id);
                      setJoinForm((prev) => ({
                        ...prev,
                        email: currentUser?.email || prev.email,
                      }));
                    }}
                  >
                    {isFull
                      ? "Table full"
                      : isAlreadyJoined
                      ? "Already joined"
                      : joinBusyId === table.id
                      ? "Joining..."
                      : "Join table"}
                  </button>
                  {isAlreadyJoined ? (
                    <p className="micro">You are already part of this table.</p>
                  ) : null}
                  {activeJoinTableId === table.id ? (
                    <form
                      className="joinInlineForm"
                      onSubmit={(event) => handleJoinSubmit(event, table)}
                    >
                      <input
                        type="email"
                        placeholder="your .edu email"
                        value={joinForm.email}
                        onChange={(event) =>
                          setJoinForm((prev) => ({
                            ...prev,
                            email: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        type="text"
                        placeholder="Anonymous name (ex: NightOwl)"
                        value={joinForm.alias}
                        onChange={(event) =>
                          setJoinForm((prev) => ({
                            ...prev,
                            alias: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        type="text"
                        placeholder="One-line topic note"
                        value={joinForm.note}
                        onChange={(event) =>
                          setJoinForm((prev) => ({
                            ...prev,
                            note: event.target.value,
                          }))
                        }
                        required
                      />
                      <button className="cta" type="submit">
                        Continue to verify and join
                      </button>
                    </form>
                  ) : null}
                  <div className="memberList">
                    {attendees.map((attendee, index) => (
                        <p key={`${attendee.uid || "member"}-${index}`}>
                          {attendee.displayName || "Anonymous"}
                          {attendee.note ? ` - ${attendee.note}` : ""}
                          {attendee.isHost ? " (host)" : ""}
                        </p>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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

      <section className="section">
        <p className="quoteLine">
          "Natural collisions happen when we are sharing food and eating
          together, and this natural collision turns into lifelong friendships."
        </p>
      </section>

      <section className="section" ref={feedbackSectionRef}>
        <div className="feedbackFooterRow">
          <p className="feedbackFooterText">
            Feedback & Request: help us improve each collision.
          </p>
          <button type="button" className="footerFeedbackBtn" onClick={openFeedbackSection}>
            Feedback & Request
          </button>
        </div>
        {showFeedbackSection ? (
          <div className="feedbackModalBackdrop">
            <div className="feedbackModal">
              <div className="titleRow">
                <h2>rate and feedback</h2>
                <button
                  type="button"
                  className="helpBtn"
                  aria-label="Close feedback form"
                  onClick={() => setShowFeedbackSection(false)}
                >
                  x
                </button>
              </div>
              <form onSubmit={handleFeedbackSubmit} className="feedbackForm">
                <div>
                  <label>Rate us</label>
                  <div className="starsRow">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <label key={star} className="starLabel">
                        <input type="radio" name="rating" value={star} required />
                        <span>★</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="feedback">Feedback</label>
                  <textarea id="feedback" name="feedback" rows="3" placeholder="How was your meetup?" />
                </div>
                <div>
                  <label htmlFor="featureRequest">Feature request</label>
                  <textarea
                    id="featureRequest"
                    name="featureRequest"
                    rows="3"
                    placeholder="What should we add next?"
                  />
                </div>
                <div>
                  <label htmlFor="meetImage">Upload meetup photo (optional)</label>
                  <input id="meetImage" name="meetImage" type="file" accept="image/*" />
                </div>
                <div>
                  <label htmlFor="contact">Contact email (optional)</label>
                  <input id="contact" name="contact" type="email" placeholder="you@email.com" />
                </div>
                <button className="cta" type="submit" disabled={feedbackBusy}>
                  {feedbackBusy ? "Submitting..." : "Send feedback"}
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </section>

    </main>
  );
}
