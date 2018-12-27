﻿using CodeStream.VisualStudio.Models;
using System;
using System.Diagnostics;

namespace CodeStream.VisualStudio
{
    public class Application
    {
        public static string Name = "CodeStream";

        /// <summary>
        /// Gets the version information for the host process (IDE) aka VisualStudio.
        /// </summary>
        /// <returns>The version of the host process.</returns>
        public static FileVersionInfo HostVersion { get; }
        public static Version Version { get; }
        public static Ide Ide { get; }
        public static Extension Extension { get; }

        public static string ProductName { get; }
        public static string ProductVersion { get; }

       // public static string VisualStudioInstallDirectory { get; }

        static Application()
        {
            HostVersion = System.Diagnostics.Process.GetCurrentProcess().MainModule.FileVersionInfo;
            Version = typeof(Application).Assembly.GetName().Version;

            Ide = new Ide
            {
                Name = HostVersion.FileDescription,
                Version = HostVersion.ProductVersion
            };

            Extension = new Extension
            {
                Version = Version.ToString(),
                VersionFormatted = Version.ToString(),
                // TODO add these
                Build = string.Empty,
                BuildEnv = string.Empty
            };

            ProductName = HostVersion.FileDescription;
            ProductVersion = HostVersion.ProductVersion;

            //try
            //{
            //    using (var process = Process.ProcessFactory.Create(
            //        @"c:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe", "-format json"))
            //    {
            //        bool processStarted = process.Start();
            //        if (processStarted)
            //        {
            //            var doo = Newtonsoft.Json.JsonConvert.DeserializeObject<JToken>(
            //                process.StandardOutput.ReadToEnd());

            //            VisualStudioInstallDirectory = doo
            //                .Where(_ =>
            //                    _.Value<string>("installationVersion").Contains(ProductVersion)).Select(_ =>
            //                    new
            //                    {
            //                        Path = _.Value<string>("installationPath")
            //                    }).Select(_ => _.Path).FirstOrDefault();
            //        }
            //    }
            //}
            //catch (Exception ex)
            //{
            //}
        }
    }
}
