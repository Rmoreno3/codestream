﻿using CodeStream.VisualStudio.Extensions;
using System.Windows.Controls;

namespace CodeStream.VisualStudio.Browsers
{
    public class WindowEventArgs
    {
        public WindowEventArgs(string message)
        {
            Message = message;
        }

        public string Message { get; }
    }

    public abstract class BrowserBase : IBrowser
    {
        public virtual string FooterHtml { get; } = "";

        public abstract void AddWindowMessageEvent(WindowMessageHandler handler);

        public abstract void AttachControl(Grid grid);

        public virtual void LoadHtml(string html) { }

        public virtual void PostMessage(string message) { }

        public virtual void PostMessage(object message)
        {
            PostMessage(message.ToJson());
        }
    }    

    public interface IBrowser
    {
        void PostMessage(string message);
        void PostMessage(object message);
        void LoadHtml(string html);
        void AddWindowMessageEvent(WindowMessageHandler handler);
        void AttachControl(Grid grid);
        string FooterHtml { get; }
    }

    public delegate void WindowMessageHandler(object sender, WindowEventArgs e);
}