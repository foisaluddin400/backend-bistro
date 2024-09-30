const express = require("express");
const app = express();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const http = require("http");
const socketIo = require("socket.io");

// Create server with HTTP and Socket.IO
const server = http.createServer(app);
const io = socketIo(server);
// eti hocce payment secret
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

//middlware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xlk7a.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const database = client.db("bistroDb");
    const menuCollectui = database.collection("menu");

    const reviewdatabase = client.db("bistroDb");
    const reviewCollectui = reviewdatabase.collection("reviews");
    //addto cart er server
    const cartdatabase = client.db("bistroDb");
    const cartsCollectui = cartdatabase.collection("carts");

    const userdatabase = client.db("bistroDb");
    const usersCollectui = userdatabase.collection("users");

    const paymentdatabase = client.db("bistroDb");
    const paymentCollectui = paymentdatabase.collection("payments");

    const contactdatabase = client.db("bistroDb");
    const contactMessages = contactdatabase.collection("contactMessages");


    io.on("connection", (socket) => {
      console.log("A user connected");

      // Handle incoming chat messages
      socket.on("sendMessage", (message) => {
        io.emit("receiveMessage", message); // Send message to all clients
      });

      socket.on("disconnect", () => {
        console.log("A user disconnected");
      });
    });
  


    app.post("/contact", async (req, res) => {
      const { name, email, phone, message } = req.body;
      console.log("Form Data Received:", { name, email, phone, message });
    
      // Email Validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, error: "Invalid email address." });
      }
    
      // Nodemailer Setup
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    
      const mailOptions = {
        from: email,
        to: process.env.EMAIL_USER,
        subject: `New Contact Form Message from ${name}`,
        text: `You have received a new message from:
        Name: ${name}
        Email: ${email}
        Phone: ${phone}
        Message: ${message}`,
      };
    
      try {
        // Insert the contact message into the MongoDB collection
        const contactMessage = {
          name,
          email,
          phone,
          message,
          createdAt: new Date(), // Add a timestamp
        };
        
        await contactMessages.insertOne(contactMessage);
    
        // Send the email
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info);
        
        res.status(200).json({ success: true });
      } catch (error) {
        console.error("Error sending email or saving to database:", error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    
   



    //review api make server theke ui te anci step-1
    app.get("/reviews", async (req, res) => {
      const cursor = reviewCollectui.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // add to cart korar jonno server e data pathacci
    app.post("/carts", async (req, res) => {
      const user = req.body;
      console.log("added", user);
      const result = await cartsCollectui.insertOne(user);
      res.send(result);
    });
    // add to cart korar jonno server theke ui te dekhacci
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const cursor = cartsCollectui.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });
    // addto cart korar por delet korar jonno
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollectui.deleteOne(query);
      res.send(result);
    });

    //user er email name database e pathanor jonno
    app.post("/users", async (req, res) => {
      const user = req.body;
      console.log("added", user);
      const query = { email: user.email };
      const existingUser = await usersCollectui.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await usersCollectui.insertOne(user);
      res.send(result);
    });

    //jwt releted api 1st-step
    app.post("/jwt", async (req, res) => {
      //jwt create korci eti authprovider e giyece 1st-step
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // eti useSecure e used hoice jate amra sohoje userHome e dekhaite pari
    //middlewared
    const verifyToken = (req, res, next) => {
      console.log("inside verified token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "fordibben access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "fordibben access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollectui.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user k server theke anar jonno
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollectui.find().toArray();
      res.send(result);
    });

    // admin related api jwt
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { email: email };
      const user = await usersCollectui.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    //menu api make server theke ui te anci step-1
    app.get("/menu", async (req, res) => {
      const cursor = menuCollectui.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
      const user = req.body;
      console.log("added", user);
      const result = await menuCollectui.insertOne(user);
      res.send(result);
    });

    app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollectui.deleteOne(query);
      res.send(result);
    });

    //menu gula upadate korar jonno
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollectui.findOne(query);
      res.send(result);
    })
    app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const item = req.body;
      
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
          $set: {
              name: item.name,
              category: item.category,
              price: item.price,
              recipe: item.recipe, // Recipe field added here
              image: item.image,
          }
      };
      
      const result = await menuCollectui.updateOne(filter, updateDoc);
      res.send(result);
  });
  //menu gula upadate korar jonno

    // user theke delet korar jonno
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollectui.deleteOne(query);
      res.send(result);
    });
    // user k admin korar jonno
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollectui.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    // eti hocce payment korar backend
    app.post('/create-payment-intent', async(req, res) => {
      const {price} = req.body;
      const amount = parseInt(price * 100);
      console.log(amount,'amount inside the intent')

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({clientSecret: paymentIntent.client_secret})
    });

    app.get('/payments/:email', verifyToken, async(req, res) => {
      const query ={email: req.params.email}
      if(req.params.email !== req.decoded.email){
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollectui.find(query).toArray();
      res.send(result);
    });

    app.post('/payments', async(req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollectui.insertOne(payment)
      console.log('payment info', payment);
      const query = {
        _id:{
          $in : payment.cartIds.map(id => new ObjectId(id))
        }
      };
      const deletResult = await cartsCollectui.deleteMany(query);
      res.send({paymentResult, deletResult})
    });


    // admin home er jonno sob item total price and total item sob admin home e dekhanor jonno 
     app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollectui.estimatedDocumentCount();
      const menuItems = await menuCollectui.estimatedDocumentCount();
      const orders = await paymentCollectui.estimatedDocumentCount();

      const result = await paymentCollectui.aggregate([
        {
          $group: {
            _id:null,
            totaRevenue:{
              $sum: '$price'
            }
          }
        }
      ]).toArray();
      const revenue = result.length > 0? result[0].totaRevenue: 0;
      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
     });



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("boss is running");
});

app.listen(port, () => {
  console.log(`Server started on port${port}`);
});
