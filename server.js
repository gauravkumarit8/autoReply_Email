const express = require("express");
const app = express();
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const fs = require("fs").promises;
const { google } = require("googleapis");

const port = 8080;

//what work to be performed
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

//set the label name where message will be kept
const labelName = "Auto-Reply";

app.get("/", handleRequest);

async function handleRequest(req, res) {

  //get the details from the secrete json file which contain google cloud api's client_id and ....
  const auth = await authenticate({
    keyfilePath: path.join(__dirname, "secretes.json"),
    scopes: SCOPES,
  });

  //now access the google gmail
  //person who is authorized can only use this api
  const gmail = google.gmail({ version: "v1", auth });

  const labelId = await createLabel(auth);
  console.log(`Label ${labelId}`);

  //set The interval in which our program will check if there any message or not unreplied
  setInterval(async () => {
    const messages = await getUnrepliedMessages(auth, gmail);
    console.log(`Found ${messages.length} unreplied message`);

    if (messages.length > 0) {
      for (const message of messages) {
        const email = await getEmail(auth, gmail, message.id);

        const hasReplied = checkReplied(email);

        if (!hasReplied) {
          await sendAutoReply(auth, gmail, email, labelId);
          await moveEmailToLabel(auth, gmail, message.id, labelId);
        }
      }
    }
  }, getRandomInterval());

  res.json({ "this is Auth": auth });
  //console.log("This is the Auth: ",auth);
}

//create a seperate label where all the mail will be store
async function createLabel(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const response = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name: labelName,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    return response.data.id;
  } catch (error) {
    if (error.code === 409) {
      const response = await gmail.users.labels.list({
        userId: "me",
      });
      const label = response.data.labels.find(
        (label) => label.name === labelName
      );
      return label.id;
    } else {
      throw error;
    }
  }
}

//Check for the unreplied message in the gmail.
async function getUnrepliedMessages(auth, gmail) {
  const response = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["INBOX"],
    q: "is:unread",
  });

  return response.data.messages || [];
}

async function getEmail(auth, gmail, messageId) {
  const messageData = await gmail.users.messages.get({
    auth,
    userId: "me",
    id: messageId,
  });
  return messageData.data;
}

function checkReplied(email) {
  return email.payload.headers.some((header) => header.name === "In-Reply-To");
}

async function sendAutoReply(auth, gmail, email, labelId) {
  const replyMessage = {
    userId: "me",
    resource: {
      raw: Buffer.from(
        `To: ${
          email.payload.headers.find((header) => header.name === "From").value
        }\r\n` +
          `Subject: Re: ${
            email.payload.headers.find((header) => header.name === "Subject")
              .value
          }\r\n` +
          `Content-Type: text/plain; charset="UTF-8"\r\n` +
          `Content-Transfer-Encoding: 7bit\r\n\r\n` +
          `Thank you for your email. I'm currently on unavailable and will reply to you when I return.\r\n`
      ).toString("base64"),
    },
  };

  await gmail.users.messages.send(replyMessage);
}

async function moveEmailToLabel(auth, gmail, messageId, labelId) {
  await gmail.users.messages.modify({
    auth,
    userId: "me",
    id: messageId,
    resource: {
      addLabelIds: [labelId],
      removeLabelIds: ["INBOX"],
    },
  });
}

function getRandomInterval() {
  return Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000;
}

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
