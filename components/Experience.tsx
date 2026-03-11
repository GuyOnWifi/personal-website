"use client";

import { motion } from "framer-motion";
import { Briefcase } from "lucide-react";

interface ExperienceItem {
  id: number;
  role: string;
  company: string;
  location: string;
  date: string;
  bullets: string[];
}

const experiences: ExperienceItem[] = [
  {
    id: 1,
    role: "Cloud & Network Services",
    company: "Nokia",
    location: "Ottawa, ON",
    date: "May 2025 – Aug 2025",
    bullets: [
      "Developed a cloud-native multi-agent LLM system, enabling RAG-driven chain-of-thought analysis and network reconfiguration via MCP servers to autonomously resolve 5G network issues."
    ],
  },
  {
    id: 2,
    role: "Chief Technology Officer",
    company: "Factful (Startup)",
    location: "Remote",
    date: "July 2023 – Present",
    bullets: [
      "Managed a team of 5 developers to build the world's first AI-powered fact checker.",
      "Achieved 20k+ visits during beta launch and raised $10k+ in credits.",
      "Finalist in Sequoia Arc, Y Combinator (YC), and a16z startup programs.",
      "Developed dynamic, responsive web applications using React.js to enhance user experience and optimize performance.",
      "Integrated RESTful APIs and third-party services to connect front-end components with back-end systems."
    ],
  },
  {
    id: 3,
    role: "Swim Instructor",
    company: "Town of Oakville",
    location: "Oakville, Ontario",
    date: "September 2024 – Present",
    bullets: [
      "Worked with swimmers to build confidence in water, teaching them with progressions.",
      "Handled parent feedback and communications efficiently.",
      "Developed customized lesson plans to address individual student needs, demonstrating strong problem-solving and adaptability skills."
    ],
  }
];

export default function Experience() {
  return (
    <section id="experience" className="w-full py-20 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h2 className="text-4xl font-bold flex items-center gap-4 text-[#283655]">
            <Briefcase className="w-8 h-8 text-[#b3a8d6]" />
            Experience
          </h2>
          <div className="w-24 h-1 bg-[#b3a8d6] mt-4 rounded-full"></div>
        </motion.div>

        <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#b3a8d6] before:to-transparent">
          {experiences.map((exp, index) => (
            <motion.div
              key={exp.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
            >
              {/* Timeline dot */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-[#283655] group-hover:bg-[#b3a8d6] group-hover:scale-110 transition-all duration-300 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"></div>
              
              {/* Content Card */}
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-2">
                  <h3 className="font-bold text-xl text-gray-900">{exp.role}</h3>
                  <span className="text-sm font-medium text-[#b3a8d6] bg-[#b3a8d6]/10 px-3 py-1 rounded-full w-fit">
                    {exp.date}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-4 text-gray-600 font-medium">
                  <span className="text-[#283655]">{exp.company}</span>
                  <span>•</span>
                  <span className="text-sm">{exp.location}</span>
                </div>
                <ul className="space-y-2 text-gray-600 text-sm">
                  {exp.bullets.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#b3a8d6] mt-1">▹</span>
                      <span className="leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
