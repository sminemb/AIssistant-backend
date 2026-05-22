# AIssistant

AIssistant is an academic study assistant for students. It helps students manage learning work and get AI-supported study help.

## Language

**AIssistant**:
The product: an academic study assistant for students.
_Avoid_: StudyAI

**AI Study Assistant**:
The assistant persona inside AIssistant that responds to study-related prompts.
_Avoid_: AIssistant when referring only to the chat persona

**Student**:
The primary person using AIssistant. A Student has an account, owns their study-related data, and has a lightweight profile with display name, email, timezone, and optional avatar presentation.
_Avoid_: User when discussing the domain, Teacher, Parent, Admin, Classroom

**Student Day**:
A calendar day interpreted in the Student's timezone. Today, Due Soon windows, and daily Progress use the Student Day rather than the server's timezone.
_Avoid_: Server day, UTC day when referring to student-facing dates

**Course**:
A Student's class or subject area that groups related study work. A Course is active unless archived by the Student; Courses are not deleted in the initial product. Active Course names are unique for each Student. Archiving a Course does not change or hide its Tasks, and Students may still assign Tasks to archived Courses when the archived state is clear.
_Avoid_: Subject, Class

**Task**:
A study work item owned by a Student and associated with zero or one Course. A Task can represent assignment work, exam preparation, reading, practice, writing, or review. Non-deleted Task titles are unique per Student within the same Course, and course-less Tasks share their own uniqueness group. A Student may delete a Task, which removes it from future dashboard and Progress calculations.
_Avoid_: Assignment, Study Item

**Suggested Task**:
A persisted Task proposal made by the AI Study Assistant in a Conversation. A Suggested Task can be pending, confirmed, or dismissed; confirmation creates a Task and marks the Suggested Task confirmed.
_Avoid_: Task before confirmation

**Study Plan**:
A set of Suggested Tasks produced by the AI Study Assistant in a Conversation. In the initial product, a Study Plan is not a separate saved object.
_Avoid_: Planner, Schedule when referring to AI-generated task suggestions

**Due Date**:
The date or date-time by which a Task should be completed. A Due Date may be date-only or date-time.
_Avoid_: Deadline when referring to the Task itself

**Due Soon**:
An incomplete Task that is overdue or has a Due Date within the next 14 days.
_Avoid_: Upcoming when overdue Tasks are included

**Today's Tasks**:
Tasks explicitly selected by the Student for a day's focus list. A Task does not need a Due Date of today to be one of Today's Tasks, and the same Task may be selected on multiple days until completed.
_Avoid_: Tasks due today

**Completion State**:
Whether a Task is incomplete or complete. The Student changes this state manually in the initial product.
_Avoid_: Progress percentage when referring to a single Task

**Progress**:
Aggregate Task completion over time for a Student, optionally grouped by Course.
_Avoid_: Mastery, Grade, Streak, Engagement

**Conversation**:
A saved exchange between a Student and the AI Study Assistant. A Conversation may be associated with zero or one Course, and may be deleted by the Student.
_Avoid_: Chat when referring to the persisted domain object

**Message**:
One utterance inside a Conversation, authored by either the Student or the AI Study Assistant. In the initial product, individual Messages are not edited or deleted.
_Avoid_: Prompt when referring to both student and assistant entries

**Assistant Context**:
The limited Student data made available to the AI Study Assistant when producing a reply: Courses connected to Due Soon or Today's Tasks, Due Soon Tasks, Today's Tasks, and recent Messages from the current Conversation.
_Avoid_: Full student history, Memory

## Example Dialogue

Developer: "Should the dashboard header say StudyAI?"
Domain expert: "No. AIssistant is the product name."

Developer: "When a student opens chat, are they talking to AIssistant or the AI Study Assistant?"
Domain expert: "They are using AIssistant, and the chat persona is the AI Study Assistant."

Developer: "Do we need roles for teachers or classroom admins?"
Domain expert: "No. The first version is centered on a Student and their own study work."

Developer: "Can backend data belong to an anonymous demo profile?"
Domain expert: "No. Courses, Tasks, Conversations, and Messages belong to a real Student account."

Developer: "Does AIssistant need grade level or school in the Student profile?"
Domain expert: "No. The initial profile stays limited to identity, timezone, and optional avatar presentation."

Developer: "Does Today mean the server's date?"
Domain expert: "No. Today is based on the Student Day."

Developer: "Should we call Biology a subject or a course?"
Domain expert: "Course. Biology is a Course in AIssistant."

Developer: "When does a Course stop appearing by default?"
Domain expert: "When the Student archives it."

Developer: "Can a Student delete an old Course?"
Domain expert: "No. In the initial product, the Student archives the Course instead."

Developer: "Can a Student have two active Biology Courses?"
Domain expert: "No. Active Course names are unique for each Student."

Developer: "Does archiving Biology hide its incomplete Tasks?"
Domain expert: "No. Archiving a Course does not change or hide its Tasks."

Developer: "Can a Student assign a Task to an archived Course?"
Domain expert: "Yes, if the archived Course is clearly labeled or separated."

Developer: "Is Essay Draft a deadline?"
Domain expert: "No. Essay Draft is a Task. Tomorrow at 11:59 PM is its Due Date."

Developer: "Does every Due Date need an exact time?"
Domain expert: "No. A Due Date may be date-only or date-time."

Developer: "Should an overdue incomplete Task disappear from priority views?"
Domain expert: "No. It is still Due Soon until the Student completes it."

Developer: "Are Today's Tasks just Tasks due today?"
Domain expert: "No. The Student explicitly chooses Today's Tasks for the day."

Developer: "Does selecting a Task for today count as Progress?"
Domain expert: "No. Progress counts completed Tasks, not daily selection."

Developer: "Does every Task need a Course?"
Domain expert: "No. A Task can be general study work without belonging to a Course."

Developer: "Does a deleted Task still count toward Progress?"
Domain expert: "No. Deleted Tasks are removed from future dashboard and Progress calculations."

Developer: "Can a Student create two Biology Tasks named Read Chapter 4?"
Domain expert: "No. Task titles are unique per Student within the same Course."

Developer: "Can a deleted Task title be reused?"
Domain expert: "Yes. Deleted Tasks do not reserve their titles."

Developer: "Does AIssistant complete Tasks automatically after a chat?"
Domain expert: "No. A Student manually marks each Task complete or incomplete."

Developer: "Can the AI Study Assistant create Tasks directly?"
Domain expert: "No. It can propose Suggested Tasks, and the Student confirms which ones become Tasks."

Developer: "Should we save Study Plans as their own records?"
Domain expert: "No. A Study Plan is assistant output made of Suggested Tasks; confirmed items become normal Tasks."

Developer: "If the page refreshes, should Suggested Tasks disappear?"
Domain expert: "No. Pending Suggested Tasks are tied to the Conversation until confirmed or dismissed."

Developer: "What happens when a Student confirms a Suggested Task?"
Domain expert: "AIssistant creates a Task and marks the Suggested Task confirmed."

Developer: "Can the Student reject a Suggested Task?"
Domain expert: "Yes. The Student can dismiss it so it is no longer pending."

Developer: "Does asking the assistant a Biology question increase Biology Progress?"
Domain expert: "No. Progress comes from completed Tasks over time."

Developer: "Is chat history temporary?"
Domain expert: "No. A Student has saved Conversations made of Messages."

Developer: "Does every Conversation need a Course?"
Domain expert: "No. A Conversation can be general study help or attached to one Course."

Developer: "Can a deleted Conversation still inform assistant replies?"
Domain expert: "No. Deleted Conversations are excluded from chat history and Assistant Context."

Developer: "Can a Student delete one Message from a Conversation?"
Domain expert: "No. The Student can delete the Conversation, not individual Messages."

Developer: "Can the AI Study Assistant see all of a Student's history?"
Domain expert: "No. It receives limited Assistant Context for the current reply."

Developer: "Can Assistant Context include an archived Course?"
Domain expert: "Yes, when that Course has Due Soon or Today's Tasks."
