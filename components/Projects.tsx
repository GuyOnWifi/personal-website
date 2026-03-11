"use client";

import { motion } from "framer-motion";
import { FolderGit2, ExternalLink, Github } from "lucide-react";

interface ProjectItem {
    id: number;
    title: string;
    tech: string[];
    description: string[];
    links?: { github?: string; live?: string };
}

const projects: ProjectItem[] = [
    {
        id: 1,
        title: "Phys.io",
        tech: ["Python", "OpenCV", "Flask", "React", "Vite", "Tailwind"],
        description: [
            "Developed a real-time physiotherapy monitoring tool; secured 3rd place at HackTheRidge.",
            "Uses OpenCV and custom image processing algorithms to evaluate accuracy of performed physiotherapy exercises.",
            "Built a responsive user interface with React and Tailwind."
        ]
    },
    {
        id: 2,
        title: "Neural Network From Scratch",
        tech: ["Python", "Numpy"],
        description: [
            "Built a computer vision model from scratch to recognize MNIST digits with 98% accuracy without leveraging existing ML libraries.",
            "Gained a deep understanding of linear algebra, vector calculus, and machine learning algorithms."
        ]
    },
    {
        id: 3,
        title: "JS Interpreter",
        tech: ["Javascript", "React", "Tailwind"],
        description: [
            "Built a working lexer, parser, and syntax tree walker to interpret a custom Javascript-esque language to learn compiler theory.",
            "Used React & Tailwind to develop a user interface, allowing users to code within their browsers."
        ]
    }
];

export default function Projects() {
    return (
        <section id="projects" className="w-full py-20 bg-gray-50">
            <div className="max-w-5xl mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="mb-12 flex flex-col items-center text-center"
                >
                    <h2 className="text-4xl font-bold flex items-center justify-center gap-3 text-[#283655]">
                        <FolderGit2 className="w-8 h-8 text-[#b3a8d6]" />
                        Featured Projects
                    </h2>
                    <div className="w-24 h-1 bg-[#b3a8d6] mt-4 rounded-full"></div>
                    <p className="mt-4 text-gray-600 max-w-2xl">
                        A selection of my technical projects ranging from full-stack applications to machine learning implementations.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {projects.map((project, index) => (
                        <motion.div
                            key={project.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group flex flex-col bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-300"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="p-3 bg-[#b3a8d6]/10 rounded-xl">
                                    <FolderGit2 className="w-8 h-8 text-[#283655]" />
                                </div>
                                <div className="flex gap-3">
                                    {project.links?.github && (
                                        <a href={project.links.github} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#283655] transition-colors">
                                            <Github className="w-5 h-5" />
                                        </a>
                                    )}
                                    {project.links?.live && (
                                        <a href={project.links.live} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-[#b3a8d6] transition-colors">
                                            <ExternalLink className="w-5 h-5" />
                                        </a>
                                    )}
                                </div>
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-[#b3a8d6] transition-colors">
                                {project.title}
                            </h3>

                            <div className="flex-grow space-y-3 mb-6">
                                {project.description.map((desc, i) => (
                                    <p key={i} className="text-sm text-gray-600 leading-relaxed">
                                        {desc}
                                    </p>
                                ))}
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                                {project.tech.map((tech, i) => (
                                    <span
                                        key={i}
                                        className="text-xs font-mono font-medium text-[#283655] bg-gray-100 px-2.5 py-1 rounded-md"
                                    >
                                        {tech}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
