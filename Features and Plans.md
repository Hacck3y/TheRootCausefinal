The CivicX: Minimum Viable Product (MVP) PRD
Document Type: Product Requirements Document (MVP Scope)

1. MVP Objectives
Launch a secure, verifiable user registration system to prevent bot networks.
Enable structured, geographically tagged problem and root-cause submissions.
Provide a functional, algorithm-driven feed for localized content discovery.
Establish baseline moderation and voting mechanics to ensure content quality.
Ranking system based on interaction ,Push notifications and Feedback System
2. MVP Feature Scope
2.1 Authentication & Identity


Feature
Specific Requirement / Acceptance Criteria
Google Auth Only
Implement OAuth 2.0 with Google. Restrict other signup methods to ensure rapid, secure onboarding.
User Verification
Integrate Captcha and phone number hashing verification to prevent duplicacy.

There can be unverified users.
Privacy Controls
Toggle for public profile vs. full anonymity (including anonymous voting).




2.2 Content Creation & Submissions

Feature
Specific Requirement / Acceptance Criteria
Structured Submissions
UI for Idea/Problem submissions requiring category tagging and problem sorting and admin review before publish.

Problem clubbing.
Media Integrity
Auto-embed EXIF data (geotagging and timestamping) on all uploaded photos and videos to verify authenticity.


2.3 Feed & Discovery


Feature
Specific Requirement / Acceptance Criteria
Categorized Feeds
Separate tabs for 'New Submissions', 'Hot News/Local Events', and 'National Issues' with event tagging support.











2.4 Community & Moderation
Feature
Specific Requirement / Acceptance Criteria
Voting Mechanics
Reddit-style upvote/downvote system. Require users to add comments explaining their votes in specific comment.
Admin Dashboard
Web panel for admins to delete posts, block users, and manage site-wide reports with basic role authority.
Troll Filtering
Define algorithms and criteria to segregate spam/troll comments from genuine engagement.


2.5 Engagement & Feedback
Feature
Specific Requirement / Acceptance Criteria
Ranking System(User)
Weighted interaction score, time-decay trending, quality-weighted voting, and spam/troll penalty mechanisms.
Push Notifications
Status change alerts, geo-fenced community alerts, engagement loop notifications for replies.
Feedback System and FAQ
Resolution confirmation surveys, simplified in-app reporting flow, user satisfaction surveys, and dedicated feedback/feature request channels.

2.1.1
Google Auth:
Summary: Implement OAuth 2.0 with Google. Restrict other signup methods to ensure rapid, secure onboarding.
We only request for email and username
We prompt the user for 2FA if not enabled

2.1.2
User Verification:
Summary: Integrate captcha and phone number hashing to prevent duplicacy
We will implement a captcha based on history of the user instead of any puzzles: Recommended Cloudflare only for signups
We ask for their number
We ask for them provide otp sent to the phone number
We don’t store the number or the otp
We create a hash for the number (SHA256)
We store the hash for the number
Before verification hash should be checked against the stored hashes to prevent duplicacy.
This verification process should also convey that how we are storing or using their phone number. This should come as a prompt.

2.1.3
Privacy Controls
Summary: Toggle for public profile vs full anonymity including anonymous voting(upvote/downvote)
Each user account will have two profiles, one public and one anonymous
Public Profile will allow others to be able to view the posts , comments, participate in debates, upvote and downvote of that user account. Score and ranking will be allowed. Other people can view the details of interactions done by public profile including but not limited to Posts, Comments, Debate discussions , upvotes and downvotes.
Anonymous Profile will allow users to Posts, Add comments, upvote and downvote. Any scoring mechanism should not consider any influence from this profile.
Public and Anonymous profiles can switched whenever the user wants but on one post one user can only use either public or anonymous profile ie. If a user used a public profile to interact with a post, they cannot use their anonymous profile on the same post. Or vice versa.

2.2.1
Structured Submission:
Summary: UI for Idea/Problem submissions requiring category tagging and admin review before publish. Problem clubbing.
A submission should have fields for Title, Details, Geo Tagged and Time Stamped Photos, Geo Tagged and Time Stamped Videos and Audios, Questions from the submitee, Option to Open Debate or Not, Category of the problem, To post from public profile or anonymous profile
Categories should be: Bureaucratic, Executive, Infrastructure, Environmental, Policy, Other
Bureaucratic: Government red tape, documentation delays, and lack of transparency or corruption in services.
Executive: Failures in policy execution, leadership decisions, and political accountability.
Infrastructure: Repairs and development of public assets like roads, utilities, and transport.
Environmental: Issues involving waste, pollution, sanitation, and nature conservation.
Policy : credible policy reviews or suggesting new policy. 
Other: Community issues not covered by the categories above.
Each submission should be submitted to the admin role, to be reviewed in 24 hours, and will show the following status: Under Review, Accepted, Rejected with Reason for rejection(AI Agentic)
Problem Clubbing: Each submission will have a clubbing criteria, where admin can decide to club it with similar problem , category and geo location. A dispute option for clubbing should be given, where the user can see, the other problems it had been clubbed with and be able to interact in terms of conveying if the clubbing is not rightfully done.

2.2.2
Media Integrity
Summary:  Auto-embed EXIF data (geotagging and timestamping) on all uploaded photos and videos to verify authenticity.
All Images or Videos or any other form of media including Audios can be submitted.
If any media does not contain information about the Geo Location and Time Stamp, it won’t be allowed to be submitted.
Attached document : only text, no image or video are allowed. (specific format) 

2.3.1
Categorized feeds
Summary: Separate tabs for 'New Submissions', 'Trending’,’Local', and 'National' 
New Submission:  Any submission in last 24 hours with infinite scrolling mechanism and lazy load.
Trending : There can be a 50? trending posts in every hour cycle, based on their interaction rate per hour. Interaction rate means, number of users who interacted in any capacity with that post. Sort based on , category, constituency and state.
Local: Any submission made in an assembly constituency based on the geo location tagging of posts, with recent submissions coming on top and infinite scrolling mechanism and lazy load.
National: Any post within India. Submissions with a 24 hours higher interaction rate average, in a decreasing order. 500 posts?. Sort based on, category, constituency and state.


2.4.1
Voting Mechanics:
Summary: Reddit-style upvote/downvote system. Require users to add comments explaining their votes in specific comment.
     - Upvote: supporting the post with adding reason of support.
     - Downvote: not supporting the post with adding reason of it. 
     - comment- user are allowed to add thread in comment but can not comment without giving vote. Each comment will have separate thread. 


2.4.2

Admin Dashboard

Summary: Web panel for admins to delete posts, block users, review user/posts and manage site-wide reports with basic role authority.
    - Report- made by users explaining why the content is reported.
    - Deletion of posts: feedback report made by users, analyzing reports and than deleting.
    - Block users: based on reports generated by users, high frequency reported users gets banned from platform.
   - Review user/post : reports, submission of posts
   - Role : types of role- 1. report review 2. Post submission review 3. Data analysis 4. Help desk(trainable bot and human 4 or 5) 
   



2.4.3

Troll Filtering

Summary: Define criteria to segregate spam/troll comments from genuine engagement.
- Criteria : no abuses in any language (algorithm) 

2.5.1


Ranking System(User)
Summary: Weighted interaction score, quality-weighted voting, and spam/troll penalty mechanisms.

Score refers to the impact a user has on the platform and it should be visible only on their public profile. Based on score people can have different ranks/titles:
The titles a user can have on the following scores : 10,50,100,500,1000,10000,20000,50000,100000,1000000. 
The titles based on the score are as follows: Sewak (Volunteer / Helper),Karyakarta (Active Worker), Pracharak (Propagator), Pravakta (Spokesperson),Pradhan (Local Chief),Sachiv (Secretary),Maha Sachiv (General Secretary), Adhyaksha (President / Chairperson), Mantri (Minister), Mukhya Mantri (Chief Minister)
Post Accepted : +9
Post Rejected: - 5 (if a person crosses 500 score their post rejection score cost will be higher, scaling by a ration 1:10, so at 500, each reject post would -50 )
Upvote/Downvote: +3/-1 for the user who posted 
Comments on thread +1
Number of user participation in debates +0.5
Post Ban : -100
Spamming/Trolling  - 50
If a users score falls below -500, they are restricted from voting ,comments and debates
For negative scores people should get auto generated notifications with reason for reduced score except for down voting


2.5.2

Push Notifications

Summary : Status change alerts, geo-fenced community alerts, engagement loop notifications for replies in platform. System and community both.
- status change alert : rank status (system), engagement of post created by user( system and community), review of post by admin( if blocked or not blocked) (community)
- Geo- fenced community alerts : local, trending or national posts of constituency(community)


2.5.3


Feedback System & FAQ

Summary: Resolution confirmation surveys, simplified in-app reporting flow, user satisfaction surveys, and dedicated feedback/feature request channels.
Users should be able to report posts, users , comments or debate channels with comments/screenshots/recordings and explanation which will allow admins to take actions
Users should be able to provide suggestions in terms of features or bugs
Admins should be able to create surveys for post acceptance criteria ,moderation activities and people should be able to vote
There should be an FAQ page, which explains the users about how the platform functions, and how to use the platform with screen shots and appropriate explanations. Add a support mail assistance dialogue box.

