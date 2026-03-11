"use client";

import { motion } from "framer-motion";
import { Code2, Database, Layout, Lightbulb } from "lucide-react";

interface SkillCategory {
    title: string;
    icon: React.ReactNode;
    skills: string[];
}

const skillCategories: SkillCategory[] = [
    {
        title: "Languages",
        icon: <Code2 className="w-5 h-5" />,
        skills: ["Python", "JavaScript", "HTML/CSS", "TypeScript"]
    },
    {
        title: "Frameworks",
        icon: <Layout className="w-5 h-5" />,
        skills: ["React", "Node.js", "Next.js", "Flask", "Tailwind CSS", "Vite"]
    },
    {
        title: "Libraries & Tools",
        icon: <Database className="w-5 h-5" />,
        skills: ["OpenCV", "NumPy", "Git", "Framer Motion"]
    },
    {
        title: "Concepts",
        icon: <Lightbulb className="w-5 h-5" />,
        skills: ["RESTful APIs", "Machine Learning", "Computer Vision", "Linear Algebra", "Vector Calculus", "Compiler Theory"]
    }
];

export default function Skills() {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.9 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: { duration: 0.4 }
        }
    };

    return (
        <section id="skills" className="w-full py-20 bg-white">
            <div className="max-w-5xl mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6"
                >
                    <div>
                        <h2 className="text-4xl font-bold flex items-center gap-3 text-[#283655]">
                            <Code2 className="w-8 h-8 text-[#b3a8d6]" />
                            Technical Skills
                        </h2>
                        <div className="w-24 h-1 bg-[#b3a8d6] mt-4 rounded-full"></div>
                    </div>
                    <p className="text-gray-600 max-w-lg md:text-right">
                        A comprehensive overview of the technologies, frameworks, and concepts I&apos;ve worked with across various projects and roles.
                    </p>
                </motion.div>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                >
                    {skillCategories.map((category, idx) => (
                        <motion.div
                            key={idx}
                            variants={itemVariants}
                            className="bg-gray-50 border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2.5 bg-white text-[#b3a8d6] group-hover:bg-[#b3a8d6] group-hover:text-white rounded-lg shadow-sm transition-colors">
                                    {category.icon}
                                </div>
                                <h3 className="font-bold text-lg text-gray-900">{category.title}</h3>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {category.skills.map((skill, sIdx) => (
                                    <span
                                        key={sIdx}
                                        className="px-3 py-1.5 bg-white border border-gray-200 text-sm text-gray-700 font-medium rounded-lg hover:border-[#b3a8d6] hover:text-[#283655] transition-colors cursor-default"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
