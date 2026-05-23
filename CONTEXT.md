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

## Example Dialogue

Developer: "Should we model Courses and Tasks?"
Domain expert: "No. The diagrams define Study Questions, Quizzes, and Study Progress as the core study records."

Developer: "When a Student asks the chatbot something, is that a Conversation?"
Domain expert: "No. In this product, it is a Study Question with one saved Chatbot Response."

Developer: "Should the Student's question and the chatbot answer be stored separately?"
Domain expert: "No. Store them together as one Study Question record."

Developer: "Does the chatbot use previous Study Questions as context?"
Domain expert: "No. MVP chatbot responses answer only the current Study Question."

Developer: "Does generating a Quiz create a Task?"
Domain expert: "No. A Quiz is its own study assessment record."

Developer: "How many Quiz Questions are generated?"
Domain expert: "Five by default, with an optional Student-requested count capped at ten."

Developer: "Does a Quiz exist before the Student answers it?"
Domain expert: "Yes. Generating a Quiz creates the Quiz and its Quiz Questions; submitting answers completes it."

Developer: "Does an unanswered Quiz affect Study Progress?"
Domain expert: "No. Only completed Quizzes affect Study Progress."

Developer: "Can a completed Quiz be answered again?"
Domain expert: "No. Completed Quizzes are immutable; the Student generates another Quiz for another attempt."

Developer: "Can a Student submit a partially answered Quiz?"
Domain expert: "No. Quiz submission requires one selected Quiz Option for every Quiz Question."

Developer: "Can a Student have many Quizzes?"
Domain expert: "Yes. Each Quiz belongs to one Student."

Developer: "Should the Student record store the password from the diagram?"
Domain expert: "Only conceptually. The backend stores a password hash, not the plaintext password."

Developer: "Can a Student generate more than one Quiz for the same Quiz Topic?"
Domain expert: "Yes. Retakes are allowed and each completed Quiz contributes to total quizzes and average score."

Developer: "Should we only save the Quiz score?"
Domain expert: "No. Save generated Quiz Questions and the Student's Quiz Answers so the Quiz can be reviewed and scored."

Developer: "Can Quiz Questions be free-text answers?"
Domain expert: "No. MVP Quiz Questions are multiple-choice only."

Developer: "How many options does each Quiz Question have?"
Domain expert: "Exactly four options, with one correct option."

Developer: "Are Quiz Options stored as JSON on the Quiz Question?"
Domain expert: "No. Quiz Options are separate records so a Student's Quiz Answer can reference the selected option."

Developer: "Can the frontend see which Quiz Option is correct before submitting?"
Domain expert: "No. Correctness is hidden until the Quiz is completed and shown in Quiz Review."

Developer: "Does Study Progress come from completed Tasks?"
Domain expert: "No. Study Progress summarizes quiz activity and quiz scores."

Developer: "Is Study Progress recalculated from Quizzes every time?"
Domain expert: "No. One Study Progress record is stored for each Student and updated when a Quiz is completed."

Developer: "What does completed topics count?"
Domain expert: "It counts distinct Quiz Topics with at least one completed Quiz."

Developer: "What appears on the Student Dashboard?"
Domain expert: "Recent Study Questions, recent Quizzes, and Study Progress."

Developer: "Should we call the quiz subject a Course?"
Domain expert: "No. Use Quiz Topic unless a separate Course concept is added later."

Developer: "Who creates chatbot responses and Quiz Questions?"
Domain expert: "The AI Provider creates them behind the backend provider boundary."
