"use client";

import { motion } from "framer-motion";
import { User2, Mail, Github } from "lucide-react";

export default function About() {
  return (
    <section id="about" className="w-full py-20 bg-gray-50 flex items-center justify-center">
      <div className="max-w-5xl mx-auto px-6 w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <h2 className="text-4xl font-bold flex items-center gap-4 text-[#283655]">
            <User2 className="w-8 h-8 text-[#b3a8d6]" />
            About Me
          </h2>
          <div className="w-24 h-1 bg-[#b3a8d6] mt-4 rounded-full"></div>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Main Info Column */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1 space-y-6 text-lg text-gray-700 leading-relaxed"
          >
            <p>
              Hi, I&apos;m <span className="font-bold text-[#283655]">Eason Huang</span>.
            </p>
            <p>
              I do things.
            </p>
          </motion.div>

          {/* Quick Facts & Contact Column */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="lg:w-1/3 space-y-8"
          >
            {/* Education Box */}
            {/*
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#b3a8d6]/20 to-transparent rounded-bl-full -z-10 transition-transform group-hover:scale-110"></div>
              <h3 className="font-bold text-xl text-gray-900 mb-4 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#283655]" />
                Education
              </h3>
              <div className="space-y-2">
                <p className="font-semibold text-[#283655]">University of Waterloo</p>
                <p className="text-gray-600 font-medium">Bachelor of Computer Science</p>
                <div className="flex items-center gap-2 text-sm text-gray-500 mt-2">
                  <MapPin className="w-4 h-4" /> Waterloo, ON
                </div>
                <div className="inline-block mt-3 text-sm font-medium text-[#b3a8d6] bg-[#b3a8d6]/10 px-3 py-1 rounded-full">
                  Expected Sept 2025
                </div>
              </div>
            </div>
            */}

            {/* Contact Details */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-xl text-gray-900 mb-4">Connect</h3>
              <ul className="space-y-4">
                <li>
                  <a href="mailto:me@easonhuang.dev" className="flex items-center gap-3 text-gray-600 hover:text-[#b3a8d6] transition-colors group">
                    <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-[#b3a8d6]/10 transition-colors">
                      <Mail className="w-5 h-5 group-hover:text-[#b3a8d6]" />
                    </div>
                    <span>me@easonhuang.dev</span>
                  </a>
                </li>
                <li>
                  <a href="https://github.com/guyonwifi" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-gray-600 hover:text-[#b3a8d6] transition-colors group">
                    <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-[#b3a8d6]/10 transition-colors">
                      <Github className="w-5 h-5 group-hover:text-[#b3a8d6]" />
                    </div>
                    <span>github.com/guyonwifi</span>
                  </a>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

