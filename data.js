const CONFIG = {
  teacher: {
    rating: "5",
    commentPool: [
      "The teacher explains complex topics in a very simple way.",
      "I really enjoyed the lectures; they were very interactive.",
      "The instructor is very helpful and answers all queries.",
      "Material provided in class was very useful for exams.",
      "The teaching pace was perfect for the entire class.",
    ],
    selectors: ["#txtComment1", "#txtComment2", "#txtComment3"],
    submitAction: "SaveForm",
  },
  subject: {
    rating: "5",
    commentPool: [
      "This course was very well organized and easy to follow.",
      "The topics covered are very relevant to the industry.",
      "I found the learning resources to be very helpful.",
      "The workload was fair and manageable.",
      "The assessment criteria were very clear from the start.",
    ],
    maxBoxes: 8,
    idPrefix: "txtComment",
    submitAction: "ValidateForm",
  },
};
