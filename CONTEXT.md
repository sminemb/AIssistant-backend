# AIssistant

AIssistant is an academic chatbot for students. It lets a Student ask study questions, generate quizzes, and track quiz-based study progress.

## Language

**AIssistant**:
The product: an academic chatbot for students.
_Avoid_: StudyAI

**AI Provider**:
The external AI service behind AIssistant's chatbot answer and quiz generation behavior.
_Avoid_: Database, frontend logic

**Student**:
The primary person using AIssistant. A Student has a name, email, password-backed account, and owns their study questions, quizzes, and study progress.
_Avoid_: User when discussing the domain, Teacher, Parent, Admin, Classroom

**Account**:
The Student's login identity for AIssistant. One Student has one Account in the initial product, and the password is stored as a password hash.
_Avoid_: Profile when referring to authentication

**Study Question**:
A question a Student asks the chatbot and the chatbot's saved response stored together as one study record. A Student may have many Study Questions.
_Avoid_: Conversation, Message, Prompt

**Chatbot Response**:
The answer produced by AIssistant for a Study Question.
_Avoid_: Assistant Message, Completion

**Question History**:
The Student's past Study Questions. Question History can be listed for the Student but is not used as chatbot context in the MVP.
_Avoid_: Conversation context, Memory

**Quiz**:
A generated study assessment for a Student on a quiz topic. A Student may have many Quizzes, and a Quiz exists before it is answered.
_Avoid_: Task, Suggested Task, Study Plan

**Quiz State**:
Whether a Quiz has been generated or completed. A generated Quiz has Quiz Questions and no Quiz Score; a completed Quiz has submitted Quiz Answers and a Quiz Score.
_Avoid_: Task status, Completion State

**Quiz Question**:
One generated multiple-choice question inside a Quiz. A Quiz Question belongs to one Quiz and has exactly four answer options plus one correct option.
_Avoid_: Study Question when referring to generated quiz content

**Quiz Option**:
One selectable answer option for a Quiz Question. A Quiz Question has exactly four Quiz Options, and one of them is correct.
_Avoid_: Answer when referring to a generated choice before the Student selects it

**Quiz Review**:
The completed Quiz view that shows the Student's selected options and which options were correct.
_Avoid_: Generated Quiz when correctness must remain hidden

**Quiz Answer**:
The Student's selected Quiz Option for a Quiz Question. A Quiz Answer belongs to one Quiz Question and is used to calculate the Quiz Score.
_Avoid_: Chatbot Response, Message

**Quiz Topic**:
The subject or focus chosen by the Student before generating a Quiz.
_Avoid_: Course unless the product later adds a Course concept

**Quiz Score**:
The percentage result of a completed Quiz, stored on the Quiz as a value from 0 to 100. Raw correct counts are derived from Quiz Answers.
_Avoid_: Grade unless the product explicitly models school grading

**Study Progress**:
The Student's stored aggregate quiz activity and performance. Study Progress belongs to one Student and summarizes distinct completed quiz topics, total quizzes, and average score from completed Quizzes.
_Avoid_: Task progress, Completion State, Streak

**Student Dashboard**:
The Student's authenticated landing summary. It shows recent Study Questions, recent Quizzes, and Study Progress.
_Avoid_: Task dashboard, Due Soon, Today's Tasks
