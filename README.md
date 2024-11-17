# Task Handling with Node JS
Task Description:  Build a Node.js API cluster with two replica sets and create a route
to handle a simple task. The task has a rate limit of 1 task per second and 20 task
per min for each user ID. Users will hit the route to process tasks multiple times.
You need to implement a queueing system to ensure that tasks are processed
according to the rate limit for each user ID.  

1. Install NodeJs.
2. Install Redis with command npm install express bull redis fs.
3. Run the Redis server with command redis-cli monitor.
4. Enter command node task.js
5. Enter the query in command line as follows to execute 25 operations as per given requirements:  
for ($i=1; $i -le 25; $i++) { Invoke-WebRequest -Uri http://localhost:3000/task -Method POST -Body '{"user_id":"123"}' -Headers @{"Content-Type"="application/json"} }
